const supervisorNotificationsState = {
  items: [],
  filter: "all",
};

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPathname() {
  return window.location.pathname || "";
}

async function getDepartmentName(sb, profile) {
  if (!profile.department_id) return "Department";
  const { data } = await sb.from("departments").select("name").eq("id", profile.department_id).maybeSingle();
  return data?.name || "Department";
}

function bindSupervisorFrame(profile, deptName) {
  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main && main.textContent.toLowerCase().includes("welcome")) {
    main.textContent = `Welcome, ${profile.full_name}`;
  }
  if (sub && (!sub.textContent || sub.textContent.toLowerCase().includes("daily overview"))) {
    sub.textContent = `${roleLabel(profile.role)} - ${profile.work_id || profile.email}`;
  }

  const nameEls = document.querySelectorAll("#supervisorName, #topbarName, .topbar-profile-name, .sidebar-profile-name");
  nameEls.forEach((el) => (el.textContent = profile.full_name || "Supervisor"));
  const deptEls = document.querySelectorAll("#supervisorDept, .sidebar-profile-role");
  deptEls.forEach((el) => {
    if (!el.textContent || el.textContent.toLowerCase().includes("department")) el.textContent = deptName;
  });
}

async function getDepartmentEmployees(profile) {
  if (!profile.department_id) return [];
  if (window.Employees?.listEmployeesInMyDepartment) {
    return window.Employees.listEmployeesInMyDepartment(profile.department_id);
  }
  const sb = window.supabaseClient;
  const { data } = await sb
    .from("employees")
    .select("id,auth_user_id,work_id,full_name,email,role,department_id,departments(name)")
    .eq("department_id", profile.department_id)
    .order("full_name", { ascending: true });
  return data || [];
}

async function loadSupervisorDashboard(sb, profile) {
  if (!document.getElementById("supDeptEmployees")) return;
  const today = new Date().toISOString().slice(0, 10);
  const employees = await getDepartmentEmployees(profile);
  const userIds = employees.map((e) => e.auth_user_id).filter(Boolean);

  let attRows = [];
  let leaveRows = [];
  if (userIds.length) {
    const [{ data: attendance }, { data: leaves }] = await Promise.all([
      sb.from("attendance").select("user_id,clock_in,clock_out").in("user_id", userIds).gte("clock_in", `${today}T00:00:00`).lte("clock_in", `${today}T23:59:59`),
      sb.from("leaves").select("user_id,status,start_date,end_date").in("user_id", userIds).lte("start_date", today).gte("end_date", today),
    ]);
    attRows = attendance || [];
    leaveRows = leaves || [];
  }

  const presentSet = new Set(attRows.map((r) => r.user_id));
  const lateCount = attRows.filter((r) => new Date(r.clock_in).getHours() >= 9).length;
  const absentCount = Math.max(userIds.length - presentSet.size, 0);
  const pendingLeave = leaveRows.filter((r) => r.status === "pending").length;
  const issues = lateCount + absentCount;

  setText("supDeptEmployees", String(employees.length));
  setText("supPresentToday", String(presentSet.size));
  setText("supAbsentLateToday", String(absentCount + lateCount));
  setText("supPendingLeaveRequests", String(pendingLeave));
  setText("supAttendanceIssues", String(issues));

  const overview = document.getElementById("supOverviewCards");
  if (overview) {
    overview.innerHTML = `
      <div class="mini-card"><div class="mini-title">Today's Status</div><div class="mini-body">${presentSet.size} present, ${lateCount} late, ${absentCount} absent.</div></div>
      <div class="mini-card"><div class="mini-title">Pending Actions</div><div class="mini-body">${pendingLeave} leave request(s) pending review in your department.</div></div>
    `;
  }
}

async function loadSupervisorDepartment(profile) {
  const body = document.getElementById("departmentEmployeesBody");
  if (!body) return;
  const searchInput = body.closest(".content")?.querySelector("input[type='search']");
  const employees = await getDepartmentEmployees(profile);

  const render = () => {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const rows = employees.filter((e) => !q || `${e.full_name} ${e.work_id} ${e.email}`.toLowerCase().includes(q));
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">No employees to display yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (e) => `<tr>
      <td>${escapeHtml(e.work_id)}</td>
      <td>${escapeHtml(e.full_name)}</td>
      <td>${escapeHtml(roleLabel(e.role))}</td>
      <td>Active</td>
      <td>${escapeHtml(e.email || "-")}</td>
    </tr>`,
      )
      .join("");
  };

  render();
  searchInput?.addEventListener("input", render);
}

async function loadSupervisorAttendance(sb, profile) {
  const body = document.getElementById("departmentAttendanceBody");
  if (!body) return;
  const employees = await getDepartmentEmployees(profile);
  const byUser = new Map(employees.map((e) => [e.auth_user_id, e]));
  const userIds = employees.map((e) => e.auth_user_id).filter(Boolean);
  if (!userIds.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">No department employees are linked to auth users yet.</td></tr>`;
    return;
  }
  const { data } = await sb.from("attendance").select("user_id,clock_in,clock_out").in("user_id", userIds).order("clock_in", { ascending: false }).limit(200);
  const rows = data || [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">No attendance records to display yet.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const emp = byUser.get(r.user_id);
      const status = new Date(r.clock_in).getHours() >= 9 ? "Late" : "On time";
      return `<tr>
        <td>${new Date(r.clock_in).toLocaleDateString()}</td>
        <td>${escapeHtml(emp?.full_name || "-")}</td>
        <td>${new Date(r.clock_in).toLocaleTimeString()}</td>
        <td>${r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : "-"}</td>
        <td>${status}</td>
      </tr>`;
    })
    .join("");
}

async function loadSupervisorLeave(sb, profile) {
  const body = document.getElementById("supervisorLeaveBody");
  if (!body) return;
  const employees = await getDepartmentEmployees(profile);
  const byUser = new Map(employees.map((e) => [e.auth_user_id, e]));
  const userIds = employees.map((e) => e.auth_user_id).filter(Boolean);
  if (!userIds.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No department employees are linked to auth users yet.</td></tr>`;
    return;
  }
  const { data } = await sb.from("leaves").select("id,user_id,leave_type,start_date,end_date,reason,status,created_at").in("user_id", userIds).order("created_at", { ascending: false }).limit(100);
  const rows = data || [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No leave applications to display yet.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((l) => {
      const emp = byUser.get(l.user_id);
      return `<tr>
        <td>${escapeHtml(emp?.full_name || "-")}</td>
        <td>${escapeHtml(l.leave_type || "-")}</td>
        <td>${new Date(l.start_date).toLocaleDateString()} - ${new Date(l.end_date).toLocaleDateString()}</td>
        <td>${escapeHtml(l.reason || "-")}</td>
        <td>${escapeHtml(l.status || "-")}</td>
        <td>Recommend to HR/MD</td>
      </tr>`;
    })
    .join("");
}

function parseWorkIds(input) {
  return String(input || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function notifyTaskAssigned(sb, task, members) {
  const teamText = members.map((m) => `${m.work_id} (${m.full_name})`).join(", ");
  const inserts = members
    .filter((m) => !!m.auth_user_id)
    .map((m) => ({
      actor_user_id: task.supervisor_user_id,
      action: "task_assigned",
      entity: "task",
      entity_id: task.id,
      details: {
        recipient_user_id: m.auth_user_id,
        task_id: task.id,
        task_title: task.title,
        due_date: task.due_date,
        message: `Task assigned: ${task.title}. Team: ${teamText}`,
        assignee_work_id: m.work_id,
        assignee_name: m.full_name,
      },
    }));
  if (inserts.length) await sb.from("activity_logs").insert(inserts);
}

async function notifyTaskDecision(sb, profile, task, assignees, decision, remarks) {
  const inserts = assignees
    .filter((a) => !!a.assignee_user_id)
    .map((a) => ({
      actor_user_id: profile.id,
      action: `task_${decision}`,
      entity: "task",
      entity_id: task.id,
      details: {
        recipient_user_id: a.assignee_user_id,
        task_id: task.id,
        task_title: task.title,
        message: `Task "${task.title}" has been ${decision}.`,
        remarks: remarks || null,
      },
    }));
  if (inserts.length) await sb.from("activity_logs").insert(inserts);
}

async function loadSupervisorTasks(sb, profile) {
  const body = document.getElementById("supervisorTasksBody");
  if (!body) return;
  const membersWrap = document.getElementById("supAssignableMembers");
  const msg = document.getElementById("supTaskInlineMsg");
  const workloadCards = document.getElementById("supTeamWorkloadCards");
  const employees = await getDepartmentEmployees(profile);
  const employeeByWorkId = new Map(employees.map((e) => [String(e.work_id).toUpperCase(), e]));

  if (membersWrap) {
    membersWrap.innerHTML = employees.length
      ? employees
          .map(
            (e) => `<label class="mini-card" style="min-width:220px">
          <input type="checkbox" class="sup-member-check" value="${escapeHtml(e.work_id)}" data-name="${escapeHtml(e.full_name)}" />
          <div class="mini-title">${escapeHtml(e.full_name)}</div>
          <div class="mini-body">${escapeHtml(e.work_id)} | ${escapeHtml(e.email || "-")}</div>
        </label>`,
          )
          .join("")
      : `<div class="mini-card"><div class="mini-title">No members</div><div class="mini-body">No employees found in your department.</div></div>`;
  }

  const renderTasks = async () => {
    const { data, error } = await sb
      .from("tasks")
      .select("id,title,due_date,status,supervisor_remarks,created_at,task_assignees(id,assignee_user_id,assignee_work_id,assignee_name,assignee_status,employee_remarks,supervisor_remarks)")
      .eq("supervisor_user_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) {
      body.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">Unable to load tasks.</td></tr>`;
      if (workloadCards) workloadCards.innerHTML = "";
      return;
    }
    const rows = data || [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No tasks assigned yet.</td></tr>`;
      if (workloadCards) workloadCards.innerHTML = "";
      return;
    }

    body.innerHTML = rows
      .map((t) => {
        const assignees = t.task_assignees || [];
        const team = assignees.map((a) => `${a.assignee_work_id} (${a.assignee_name})`).join(", ");
        return `<tr>
          <td>${escapeHtml(t.title)}</td>
          <td>${escapeHtml(team || "-")}</td>
          <td>${t.due_date ? new Date(t.due_date).toLocaleDateString() : "-"}</td>
          <td>${escapeHtml(t.status)}</td>
          <td>${escapeHtml(t.supervisor_remarks || "-")}</td>
          <td>
            <button class="btn ghost sup-task-decision-btn" type="button" data-task-id="${t.id}" data-decision="approved">Approve</button>
            <button class="btn ghost sup-task-decision-btn" type="button" data-task-id="${t.id}" data-decision="rejected">Reject</button>
          </td>
        </tr>`;
      })
      .join("");

    const loadByMember = new Map();
    rows.forEach((t) => {
      (t.task_assignees || []).forEach((a) => {
        const current = loadByMember.get(a.assignee_work_id) || 0;
        loadByMember.set(a.assignee_work_id, current + 1);
      });
    });
    if (workloadCards) {
      workloadCards.innerHTML = [...loadByMember.entries()]
        .map(([workId, count]) => {
          const emp = employeeByWorkId.get(String(workId).toUpperCase());
          return `<div class="mini-card"><div class="mini-title">${escapeHtml(emp?.full_name || workId)}</div><div class="mini-body">${escapeHtml(workId)} | ${count} task(s)</div></div>`;
        })
        .join("");
    }
  };

  document.getElementById("supAssignTaskBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("supTaskTitle")?.value.trim();
    const description = document.getElementById("supTaskDescription")?.value.trim();
    const dueDate = document.getElementById("supTaskDueDate")?.value || null;
    const supervisorRemarks = document.getElementById("supTaskSupervisorRemarks")?.value.trim() || null;
    const typedWorkIds = parseWorkIds(document.getElementById("supTaskWorkIdsInput")?.value);
    const checkedWorkIds = Array.from(document.querySelectorAll(".sup-member-check:checked")).map((el) => String(el.value));
    const allWorkIds = [...new Set([...typedWorkIds, ...checkedWorkIds].map((x) => x.toUpperCase()))];

    if (!title) {
      if (msg) msg.textContent = "Task title is required.";
      return;
    }
    if (!allWorkIds.length) {
      if (msg) msg.textContent = "Select at least one team member or enter at least one Work ID.";
      return;
    }
    const members = allWorkIds.map((id) => employeeByWorkId.get(id)).filter(Boolean);
    if (!members.length) {
      if (msg) msg.textContent = "No valid department employees found for the provided Work IDs.";
      return;
    }

    const { data: task, error: taskError } = await sb
      .from("tasks")
      .insert({
        supervisor_user_id: profile.id,
        department_id: profile.department_id,
        title,
        description: description || null,
        due_date: dueDate,
        supervisor_remarks: supervisorRemarks,
      })
      .select("id,supervisor_user_id,title,due_date")
      .single();
    if (taskError || !task) {
      if (msg) msg.textContent = taskError?.message || "Unable to create task.";
      return;
    }

    const assigneesPayload = members.map((m) => ({
      task_id: task.id,
      assignee_user_id: m.auth_user_id || null,
      assignee_work_id: m.work_id,
      assignee_name: m.full_name,
      assignee_status: "assigned",
      supervisor_remarks: supervisorRemarks,
    }));
    const { error: assigneeError } = await sb.from("task_assignees").insert(assigneesPayload);
    if (assigneeError) {
      if (msg) msg.textContent = assigneeError.message || "Unable to assign team members.";
      return;
    }

    await notifyTaskAssigned(sb, task, members);
    if (msg) msg.textContent = `Task assigned to ${members.length} member(s).`;
    document.getElementById("supTaskTitle").value = "";
    document.getElementById("supTaskDescription").value = "";
    document.getElementById("supTaskDueDate").value = "";
    document.getElementById("supTaskSupervisorRemarks").value = "";
    document.getElementById("supTaskWorkIdsInput").value = "";
    document.querySelectorAll(".sup-member-check").forEach((el) => {
      // eslint-disable-next-line no-param-reassign
      el.checked = false;
    });
    await renderTasks();
  });

  body.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("sup-task-decision-btn")) return;
    const taskId = target.dataset.taskId;
    const decision = target.dataset.decision;
    if (!taskId || !decision) return;
    const remarks = window.prompt(`Add remarks for ${decision} decision:`, "") || "";

    const { data: task } = await sb.from("tasks").select("id,title").eq("id", taskId).maybeSingle();
    const { data: assignees } = await sb.from("task_assignees").select("assignee_user_id").eq("task_id", taskId);

    await sb.from("tasks").update({ status: decision, supervisor_remarks: remarks || null }).eq("id", taskId);
    await sb.from("task_assignees").update({ assignee_status: decision, supervisor_remarks: remarks || null }).eq("task_id", taskId);
    await notifyTaskDecision(sb, profile, { id: taskId, title: task?.title || "Task" }, assignees || [], decision, remarks);
    if (msg) msg.textContent = `Task ${decision}.`;
    await renderTasks();
  });

  await renderTasks();
}

function supervisorNotificationTitle(action, entity) {
  const raw = String(action || "Update").replaceAll("_", " ");
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);
  return entity ? `${title} (${entity})` : title;
}

function applySupervisorNotificationFilter(filterKey) {
  const list = document.getElementById("employeeNotificationsList");
  if (!list) return;
  ["notifFilterAll", "notifFilterUnread", "notifFilterRead"].forEach((id) => document.getElementById(id)?.classList.remove("active"));
  if (filterKey === "unread") document.getElementById("notifFilterUnread")?.classList.add("active");
  else if (filterKey === "read") document.getElementById("notifFilterRead")?.classList.add("active");
  else document.getElementById("notifFilterAll")?.classList.add("active");

  supervisorNotificationsState.filter = filterKey;
  const filtered = supervisorNotificationsState.items.filter((item) => {
    if (filterKey === "read") return !!item.is_read;
    if (filterKey === "unread") return !item.is_read;
    return true;
  });
  if (!filtered.length) {
    list.innerHTML = '<div class="mini-card"><div class="mini-title">No notifications</div><div class="mini-body">No notifications in this filter.</div></div>';
    return;
  }
  list.innerHTML = filtered
    .map((item) => {
      const stateClass = item.is_read ? "read" : "unread";
      const actionBtn = item.is_read
        ? `<button class="btn ghost notif-mark-unread-btn" type="button" data-id="${item.id}">Mark as Unread</button>`
        : `<button class="btn ghost notif-mark-read-btn" type="button" data-id="${item.id}">Mark as Read</button>`;
      return `<div class="notif-item ${stateClass}">
        <div class="notif-item-head">
          <div class="notif-item-title">${supervisorNotificationTitle(item.action, item.entity)}</div>
          <div class="notif-item-time">${new Date(item.created_at).toLocaleString()}</div>
        </div>
        <div class="notif-item-body">${item.body || "No details available."}</div>
        <div class="notif-item-actions">
          ${actionBtn}
          <button class="btn ghost notif-delete-btn" type="button" data-id="${item.id}">Delete</button>
        </div>
      </div>`;
    })
    .join("");
}

async function updateSupervisorNotificationRow(sb, id, patchDetails) {
  const item = supervisorNotificationsState.items.find((x) => x.id === id);
  if (!item) return false;
  const merged = { ...(item.details || {}), ...(patchDetails || {}) };
  const { error } = await sb.from("activity_logs").update({ details: merged }).eq("id", id);
  if (error) return false;
  item.details = merged;
  item.is_read = !!merged.notification_read;
  item.deleted = !!merged.notification_deleted;
  return true;
}

function wireSupervisorNotificationActions(sb) {
  const list = document.getElementById("employeeNotificationsList");
  if (!list) return;
  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.id;
    if (!id) return;
    if (target.classList.contains("notif-mark-read-btn")) {
      if (await updateSupervisorNotificationRow(sb, id, { notification_read: true, notification_read_at: new Date().toISOString() })) {
        applySupervisorNotificationFilter(supervisorNotificationsState.filter);
      }
      return;
    }
    if (target.classList.contains("notif-mark-unread-btn")) {
      if (await updateSupervisorNotificationRow(sb, id, { notification_read: false, notification_read_at: null })) {
        applySupervisorNotificationFilter(supervisorNotificationsState.filter);
      }
      return;
    }
    if (target.classList.contains("notif-delete-btn")) {
      if (await updateSupervisorNotificationRow(sb, id, { notification_deleted: true, notification_deleted_at: new Date().toISOString() })) {
        supervisorNotificationsState.items = supervisorNotificationsState.items.filter((x) => x.id !== id);
        applySupervisorNotificationFilter(supervisorNotificationsState.filter);
      }
    }
  });

  document.getElementById("notifFilterAll")?.addEventListener("click", () => applySupervisorNotificationFilter("all"));
  document.getElementById("notifFilterUnread")?.addEventListener("click", () => applySupervisorNotificationFilter("unread"));
  document.getElementById("notifFilterRead")?.addEventListener("click", () => applySupervisorNotificationFilter("read"));
  document.getElementById("notifMarkAllReadBtn")?.addEventListener("click", async () => {
    const unread = supervisorNotificationsState.items.filter((x) => !x.is_read);
    await Promise.all(unread.map((x) => updateSupervisorNotificationRow(sb, x.id, { notification_read: true, notification_read_at: new Date().toISOString() })));
    applySupervisorNotificationFilter(supervisorNotificationsState.filter);
  });
}

async function loadSupervisorNotifications(sb) {
  const list = document.getElementById("employeeNotificationsList");
  if (!list) return;
  const { data, error } = await sb.from("activity_logs").select("id,action,entity,details,created_at").order("created_at", { ascending: false }).limit(50);
  if (error) {
    list.innerHTML = '<div class="mini-card"><div class="mini-title">Error</div><div class="mini-body">Unable to load notifications.</div></div>';
    return;
  }
  supervisorNotificationsState.items = (data || [])
    .map((row) => {
      const d = row.details || {};
      return {
        id: row.id,
        action: row.action,
        entity: row.entity,
        details: d,
        body: d.message || d.reason || d.status || d.leave_type || "",
        created_at: row.created_at,
        is_read: !!d.notification_read,
        deleted: !!d.notification_deleted,
      };
    })
    .filter((x) => !x.deleted);
  wireSupervisorNotificationActions(sb);
  applySupervisorNotificationFilter("all");
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.supervisor, Roles.admin]);
  if (!profile) return;
  const sb = window.supabaseClient;
  if (!sb) return;

  const deptName = await getDepartmentName(sb, profile);
  bindSupervisorFrame(profile, deptName);

  const path = getPathname();
  await Promise.allSettled([
    loadSupervisorDashboard(sb, profile),
    loadSupervisorDepartment(profile),
    loadSupervisorAttendance(sb, profile),
    loadSupervisorLeave(sb, profile),
    loadSupervisorTasks(sb, profile),
    loadSupervisorNotifications(sb),
  ]);

  // Keep path variable referenced for future page-specific branching if needed.
  void path;
});
