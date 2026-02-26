document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.supervisor, Roles.admin]);
  if (!profile) return;
  const sb = window.supabaseClient;
  if (!sb) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} - ${profile.work_id || profile.email}`;

  const nameEls = document.querySelectorAll("#supervisorName, #topbarName, .topbar-profile-name, .sidebar-profile-name");
  nameEls.forEach((el) => (el.textContent = profile.full_name || "Supervisor"));

  if (document.getElementById("departmentEmployeesBody")) {
    const body = document.getElementById("departmentEmployeesBody");
    const employees = await Employees.listEmployeesInMyDepartment(profile.department_id);
    body.innerHTML = "";
    for (const e of employees) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(e.profiles?.work_id ?? "")}</td>
        <td>${escapeHtml(e.full_name ?? "")}</td>
        <td>${escapeHtml(roleLabel(e.role))}</td>
        <td>${escapeHtml(e.departments?.name ?? "")}</td>
      `;
      body.appendChild(tr);
    }
  }

  if (document.getElementById("employeeNotificationsList")) {
    await loadSupervisorNotifications(sb);
  }

  if (!document.getElementById("supDeptEmployees")) return;
  const today = new Date().toISOString().slice(0, 10);

  const deptEmployees = await Employees.listEmployeesInMyDepartment(profile.department_id);
  const userIds = (deptEmployees || []).map((e) => e.auth_user_id).filter(Boolean);

  let attRows = [];
  let leaveRows = [];
  if (userIds.length) {
    const [{ data: aRows }, { data: lRows }] = await Promise.all([
      sb.from("attendance").select("user_id, clock_in, clock_out").in("user_id", userIds).gte("clock_in", `${today}T00:00:00`).lte("clock_in", `${today}T23:59:59`),
      sb.from("leaves").select("user_id, status, start_date, end_date").in("user_id", userIds).lte("start_date", today).gte("end_date", today),
    ]);
    attRows = aRows || [];
    leaveRows = lRows || [];
  }

  const presentSet = new Set(attRows.map((r) => r.user_id));
  const lateCount = attRows.filter((r) => new Date(r.clock_in).getHours() >= 9).length;
  const absentCount = Math.max(userIds.length - presentSet.size, 0);
  const pendingLeave = leaveRows.filter((r) => r.status === "pending").length;
  const issues = lateCount + absentCount;

  setText("supDeptEmployees", String(userIds.length));
  setText("supPresentToday", String(presentSet.size));
  setText("supAbsentLateToday", String(absentCount + lateCount));
  setText("supPendingLeaveRequests", String(pendingLeave));
  setText("supAttendanceIssues", String(issues));

  const overview = document.getElementById("supOverviewCards");
  if (overview) {
    overview.innerHTML = `
      <div class="mini-card"><div class="mini-title">Today's Status</div><div class="mini-body">${presentSet.size} present, ${lateCount} late, ${absentCount} absent. ${pendingLeave} leave request(s) pending.</div></div>
      <div class="mini-card"><div class="mini-title">Attendance Issues</div><div class="mini-body">${issues} issue record(s) identified in your department today.</div></div>
    `;
  }
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const supervisorNotificationsState = {
  items: [],
  filter: "all",
};

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
  const { data, error } = await sb.from("activity_logs").select("id,action,entity,details,created_at").order("created_at", { ascending: false }).limit(40);
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
