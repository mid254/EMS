function safeText(value, fallback) {
  const text = value == null ? "" : String(value).trim();
  return text || (fallback || "");
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setTextContent(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString();
}

function getPath() {
  return (window.location.pathname || "").toLowerCase();
}

let employeeNotificationsState = {
  filter: "all",
  items: [],
};

async function getDepartmentName(departmentId) {
  if (!departmentId || !window.supabaseClient) return "";
  const { data } = await window.supabaseClient
    .from("departments")
    .select("name")
    .eq("id", departmentId)
    .maybeSingle();
  return data?.name || "";
}

async function logActivity(action, entity, details) {
  if (!window.supabaseClient) return;
  try {
    const userId = (await window.supabaseClient.auth.getUser())?.data?.user?.id || null;
    await window.supabaseClient.from("activity_logs").insert([
      {
        actor_user_id: userId,
        action,
        entity: entity || null,
        details: details || {},
      },
    ]);
  } catch (err) {
    console.warn("Activity log write skipped:", err);
  }
}

async function bindProfileFrame(profile) {
  const departmentName = await getDepartmentName(profile.department_id);
  const roleName = roleLabel(profile.role);
  const name = safeText(profile.full_name, "Employee");
  const dept = safeText(departmentName, "No Department");

  setTextContent("welcomeMain", `Welcome, ${name}`);
  setTextContent("welcomeSub", `${roleName} - ${safeText(profile.work_id, profile.email)}`);
  setTextContent("empName", name);
  setTextContent("empDept", dept);
  setTextContent("topbarName", name);

  document.querySelectorAll(".sidebar-profile-name").forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll(".sidebar-profile-role").forEach((el) => {
    el.textContent = dept;
  });
  document.querySelectorAll(".topbar-profile-name").forEach((el) => {
    el.textContent = name;
  });
}

async function loadDashboardData() {
  const sb = window.supabaseClient;
  if (!sb) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const yearStart = `${now.getFullYear()}-01-01`;
  const yearEnd = `${now.getFullYear()}-12-31`;

  const { data: todayRows } = await sb
    .from("attendance")
    .select("id, clock_in, clock_out")
    .gte("clock_in", todayStart)
    .lte("clock_in", todayEnd)
    .order("clock_in", { ascending: false })
    .limit(1);

  const status = !todayRows?.length
    ? "Not clocked in"
    : todayRows[0].clock_out
      ? "Completed"
      : "Clocked in";
  setTextContent("empAttendanceStatus", status);

  const { data: monthRows } = await sb
    .from("attendance")
    .select("clock_in")
    .gte("clock_in", monthStart)
    .lte("clock_in", monthEnd);
  const uniqueDays = new Set((monthRows || []).map((r) => (r.clock_in || "").slice(0, 10)).filter(Boolean));
  setTextContent("empWorkingDays", String(uniqueDays.size));

  const { count: pendingCount } = await sb
    .from("leaves")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  setTextContent("empPendingLeaves", String(pendingCount || 0));

  const annualEntitlement = 21;
  const { data: approvedLeaves } = await sb
    .from("leaves")
    .select("start_date, end_date")
    .eq("status", "approved")
    .gte("start_date", yearStart)
    .lte("end_date", yearEnd);
  const usedDays = (approvedLeaves || []).reduce((sum, row) => {
    const start = new Date(`${row.start_date}T00:00:00`);
    const end = new Date(`${row.end_date}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return sum;
    const diff = Math.floor((end - start) / 86400000) + 1;
    return sum + diff;
  }, 0);
  setTextContent("empLeaveBalance", `${Math.max(annualEntitlement - usedDays, 0)} days`);
}

async function loadRecentActivities() {
  const container = document.getElementById("recentActivitiesList");
  if (!container || !window.supabaseClient) return;

  const { data, error } = await window.supabaseClient
    .from("activity_logs")
    .select("action, entity, created_at, details")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    container.innerHTML =
      '<div class="mini-card"><div class="mini-title">Error</div><div class="mini-body">Unable to load recent activities.</div></div>';
    return;
  }

  if (!data?.length) {
    container.innerHTML =
      '<div class="mini-card"><div class="mini-title">No activities</div><div class="mini-body">No recent activities found.</div></div>';
    return;
  }

  container.innerHTML = data
    .map((row) => {
      const action = safeText(row.action, "activity");
      const entity = safeText(row.entity, "system");
      const at = formatDateTime(row.created_at);
      return `<div class="mini-card"><div class="mini-title">${action}</div><div class="mini-body">${entity} • ${at}</div></div>`;
    })
    .join("");
}

async function loadLastClockRecord() {
  const container = document.getElementById("lastAttendanceRecord");
  if (!container || !window.supabaseClient) return;

  const { data: rows } = await window.supabaseClient
    .from("attendance")
    .select("clock_in, clock_out")
    .order("clock_in", { ascending: false })
    .limit(1);

  if (!rows?.length) {
    container.innerHTML = '<div class="mini-card"><div class="mini-title">No record</div><div class="mini-body">No clock activity yet.</div></div>';
    return;
  }

  const row = rows[0];
  const status = row.clock_out ? "Completed" : "Open";
  const day = new Date(row.clock_in).toLocaleDateString();
  container.innerHTML = `<div class="mini-card"><div class="mini-title">${day}</div><div class="mini-body">Clock-in: ${formatDateTime(row.clock_in)} | Clock-out: ${formatDateTime(row.clock_out)} | Status: ${status}</div></div>`;
}

async function wireClockActions() {
  const msg = document.getElementById("attMsg");
  const clockInBtn = document.getElementById("clockInBtn");
  const clockOutBtn = document.getElementById("clockOutBtn");
  if (!msg || !clockInBtn || !clockOutBtn) return;

  clockInBtn.addEventListener("click", async () => {
    msg.textContent = "";
    try {
      await Attendance.clockIn();
      msg.textContent = "Clocked in successfully.";
      await loadLastClockRecord();
    } catch (err) {
      msg.textContent = err?.message || "Clock in failed.";
    }
  });

  clockOutBtn.addEventListener("click", async () => {
    msg.textContent = "";
    try {
      await Attendance.clockOut();
      msg.textContent = "Clocked out successfully.";
      await loadLastClockRecord();
    } catch (err) {
      msg.textContent = err?.message || "Clock out failed.";
    }
  });

  await loadLastClockRecord();
}

async function loadAttendanceHistory() {
  const body = document.getElementById("myAttendanceBody");
  if (!body || !window.supabaseClient) return;

  const fromDate = document.getElementById("attendanceFromDate")?.value || null;
  const toDate = document.getElementById("attendanceToDate")?.value || null;

  let query = window.supabaseClient
    .from("attendance")
    .select("clock_in, clock_out")
    .order("clock_in", { ascending: false });

  if (fromDate) query = query.gte("clock_in", `${fromDate}T00:00:00`);
  if (toDate) query = query.lte("clock_in", `${toDate}T23:59:59`);

  const { data, error } = await query;
  if (error) {
    body.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">Unable to load attendance records.</td></tr>';
    return;
  }

  if (!data?.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">No attendance records found.</td></tr>';
    return;
  }

  body.innerHTML = data
    .map((row) => {
      const date = (row.clock_in || "").slice(0, 10);
      const status = row.clock_out ? "Completed" : "Open";
      return `<tr><td>${formatDate(date)}</td><td>${formatDateTime(row.clock_in)}</td><td>${formatDateTime(row.clock_out)}</td><td>${status}</td></tr>`;
    })
    .join("");
}

async function wireAttendancePage() {
  if (!document.getElementById("myAttendanceBody")) return;
  const applyBtn = document.getElementById("attendanceFilterBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", loadAttendanceHistory);
  }
  await loadAttendanceHistory();
}

async function loadLeaveHistory() {
  const body = document.getElementById("myLeaveHistoryBody");
  if (!body || !window.supabaseClient) return;

  const { data, error } = await window.supabaseClient
    .from("leaves")
    .select("id, leave_type, start_date, end_date, reason, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Unable to load leave history.</td></tr>';
    return;
  }

  if (!data?.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">No leave history to display yet.</td></tr>';
    return;
  }

  body.innerHTML = data
    .map(
      (row) =>
        `<tr><td>${safeText(row.leave_type, "Leave")}</td><td>${formatDate(row.start_date)}</td><td>${formatDate(row.end_date)}</td><td>${safeText(row.reason, "--")}</td><td>${safeText(row.status, "pending")}</td></tr>`
    )
    .join("");
}

async function wireLeavePage() {
  const submitBtn = document.getElementById("submitLeaveBtn");
  const leaveMsg = document.getElementById("leaveMsg");
  const newLeaveBtn = document.getElementById("newLeaveRequestBtn");
  if (!submitBtn || !leaveMsg) return;

  if (newLeaveBtn) {
    newLeaveBtn.addEventListener("click", () => {
      const form = document.getElementById("leaveType");
      if (form) form.focus();
    });
  }

  submitBtn.addEventListener("click", async () => {
    const leaveType = safeText(document.getElementById("leaveType")?.value, "Annual");
    const startDate = document.getElementById("leaveStartDate")?.value || "";
    const endDate = document.getElementById("leaveEndDate")?.value || "";
    const reason = safeText(document.getElementById("leaveReason")?.value, "");

    if (!startDate || !endDate) {
      leaveMsg.textContent = "Start date and end date are required.";
      return;
    }
    if (endDate < startDate) {
      leaveMsg.textContent = "End date cannot be earlier than start date.";
      return;
    }

    leaveMsg.textContent = "";
    const { data: authData } = await window.supabaseClient.auth.getUser();
    const currentUserId = authData?.user?.id || null;
    if (!currentUserId) {
      leaveMsg.textContent = "Unable to identify current user. Please sign in again.";
      return;
    }

    const { data, error } = await window.supabaseClient
      .from("leaves")
      .insert([
        {
          user_id: currentUserId,
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          reason,
          status: "pending",
        },
      ])
      .select("id")
      .single();

    if (error) {
      leaveMsg.textContent = error.message || "Failed to submit leave request.";
      return;
    }

    await logActivity("leave_requested", "leave", {
      leave_id: data.id,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
    });

    leaveMsg.textContent = "Leave request submitted.";
    setValue("leaveReason", "");
    await loadLeaveHistory();
  });

  await loadLeaveHistory();
}

async function loadPayslips() {
  const body = document.getElementById("myPayslipsBody");
  if (!body || !window.supabaseClient) return;

  const { data, error } = await window.supabaseClient
    .from("payroll")
    .select("id, period_start, period_end, net_pay")
    .order("period_start", { ascending: false });

  if (error) {
    body.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center;padding:18px">Unable to load payslips.</td></tr>';
    return;
  }

  if (!data?.length) {
    body.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center;padding:18px">No payslips to display yet.</td></tr>';
    return;
  }

  body.innerHTML = data
    .map((row) => {
      const period = `${formatDate(row.period_start)} - ${formatDate(row.period_end)}`;
      const netPay = Number(row.net_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `<tr><td>${period}</td><td>${netPay}</td><td><button class="btn ghost" type="button" disabled>Download</button></td></tr>`;
    })
    .join("");
}

async function loadProfilePage(profile) {
  if (!document.getElementById("profileFullName") || !window.supabaseClient) return;

  const departmentName = await getDepartmentName(profile.department_id);
  const { data: profileData } = await window.supabaseClient
    .from("profiles")
    .select("full_name, email, role, phone, address, emergency_contact")
    .eq("id", profile.id)
    .maybeSingle();

  setValue("profileFullName", safeText(profileData?.full_name, profile.full_name));
  setValue("profileEmail", safeText(profileData?.email, profile.email));
  setValue("profilePhone", safeText(profileData?.phone, ""));
  setValue("profileAddress", safeText(profileData?.address, ""));
  setValue("profileEmergencyContact", safeText(profileData?.emergency_contact, ""));
  setValue("profileRole", roleLabel(profileData?.role || profile.role));
  setValue("profileDepartment", safeText(departmentName, "No Department"));
}

async function wireProfileSave(profile) {
  const btn = document.getElementById("updateProfileBtn");
  const msg = document.getElementById("profileMsg");
  if (!btn || !msg || !window.supabaseClient) return;

  btn.addEventListener("click", async () => {
    msg.textContent = "";
    const payload = {
      phone: safeText(document.getElementById("profilePhone")?.value, null),
      address: safeText(document.getElementById("profileAddress")?.value, null),
      emergency_contact: safeText(document.getElementById("profileEmergencyContact")?.value, null),
    };

    const { error } = await window.supabaseClient.from("profiles").update(payload).eq("id", profile.id);
    if (error) {
      msg.textContent = error.message || "Profile update failed.";
      return;
    }

    await logActivity("profile_updated", "profile", payload);
    msg.textContent = "Profile updated successfully.";
  });
}

function renderNotifications(targetId, items) {
  const container = document.getElementById(targetId);
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="mini-card"><div class="mini-title">No updates</div><div class="mini-body">No records found.</div></div>';
    return;
  }
  container.innerHTML = items
    .map((item) => `<div class="mini-card"><div class="mini-title">${item.title}</div><div class="mini-body">${item.body}</div></div>`)
    .join("");
}

function buildNotificationTitle(action, entity) {
  const raw = safeText(action, "Update").replaceAll("_", " ");
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (!entity) return title;
  return `${title} (${safeText(entity, "system")})`;
}

function applyNotificationFilter(filterKey) {
  const list = document.getElementById("employeeNotificationsList");
  if (!list) return;

  ["notifFilterAll", "notifFilterUnread", "notifFilterRead"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.remove("active");
  });

  if (filterKey === "unread") {
    document.getElementById("notifFilterUnread")?.classList.add("active");
  } else if (filterKey === "read") {
    document.getElementById("notifFilterRead")?.classList.add("active");
  } else {
    document.getElementById("notifFilterAll")?.classList.add("active");
  }

  employeeNotificationsState.filter = filterKey;
  const filtered = employeeNotificationsState.items.filter((item) => {
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
      return `
        <div class="notif-item ${stateClass}">
          <div class="notif-item-head">
            <div class="notif-item-title">${buildNotificationTitle(item.action, item.entity)}</div>
            <div class="notif-item-time">${formatDateTime(item.created_at)}</div>
          </div>
          <div class="notif-item-body">${safeText(item.body, "No details available.")}</div>
          <div class="notif-item-actions">
            ${actionBtn}
            <button class="btn ghost notif-delete-btn" type="button" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function updateNotificationRow(id, patchDetails) {
  const sb = window.supabaseClient;
  if (!sb) return false;

  const item = employeeNotificationsState.items.find((x) => x.id === id);
  if (!item) return false;
  const mergedDetails = { ...(item.details || {}), ...(patchDetails || {}) };

  const { error } = await sb.from("activity_logs").update({ details: mergedDetails }).eq("id", id);
  if (error) {
    console.error("Failed updating notification row:", error);
    return false;
  }

  item.details = mergedDetails;
  item.is_read = !!mergedDetails.notification_read;
  item.deleted = !!mergedDetails.notification_deleted;
  return true;
}

function wireNotificationActions() {
  const list = document.getElementById("employeeNotificationsList");
  if (!list) return;

  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.id;
    if (!id) return;

    if (target.classList.contains("notif-mark-read-btn")) {
      const ok = await updateNotificationRow(id, {
        notification_read: true,
        notification_read_at: new Date().toISOString(),
      });
      if (ok) applyNotificationFilter(employeeNotificationsState.filter);
      return;
    }

    if (target.classList.contains("notif-mark-unread-btn")) {
      const ok = await updateNotificationRow(id, {
        notification_read: false,
        notification_read_at: null,
      });
      if (ok) applyNotificationFilter(employeeNotificationsState.filter);
      return;
    }

    if (target.classList.contains("notif-delete-btn")) {
      const ok = await updateNotificationRow(id, {
        notification_deleted: true,
        notification_deleted_at: new Date().toISOString(),
      });
      if (ok) {
        employeeNotificationsState.items = employeeNotificationsState.items.filter((x) => x.id !== id);
        applyNotificationFilter(employeeNotificationsState.filter);
      }
    }
  });

  document.getElementById("notifFilterAll")?.addEventListener("click", () => applyNotificationFilter("all"));
  document.getElementById("notifFilterUnread")?.addEventListener("click", () => applyNotificationFilter("unread"));
  document.getElementById("notifFilterRead")?.addEventListener("click", () => applyNotificationFilter("read"));
  document.getElementById("notifMarkAllReadBtn")?.addEventListener("click", async () => {
    const unread = employeeNotificationsState.items.filter((item) => !item.is_read);
    await Promise.all(
      unread.map((item) =>
        updateNotificationRow(item.id, {
          notification_read: true,
          notification_read_at: new Date().toISOString(),
        })
      )
    );
    applyNotificationFilter(employeeNotificationsState.filter);
  });
}

async function loadNotifications() {
  if (!window.supabaseClient || !document.getElementById("employeeNotificationsList")) return;
  const sb = window.supabaseClient;

  const { data: activityRows, error } = await sb
    .from("activity_logs")
    .select("id, action, entity, details, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    const list = document.getElementById("employeeNotificationsList");
    if (list) {
      list.innerHTML = '<div class="mini-card"><div class="mini-title">Error</div><div class="mini-body">Unable to load notifications.</div></div>';
    }
    return;
  }

  employeeNotificationsState.items = (activityRows || [])
    .map((row) => {
      const details = row.details || {};
      const body = safeText(
        details.message,
        details.reason || details.leave_type || details.status || details.address || details.phone || ""
      );
      return {
        id: row.id,
        action: row.action,
        entity: row.entity,
        details,
        body,
        created_at: row.created_at,
        is_read: !!details.notification_read,
        deleted: !!details.notification_deleted,
      };
    })
    .filter((row) => !row.deleted);

  wireNotificationActions();
  applyNotificationFilter("all");
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.employee, Roles.admin, Roles.hr, Roles.manager, Roles.supervisor]);
  if (!profile) return;
  await bindProfileFrame(profile);

  const path = getPath();
  if (path.endsWith("/dashboard.html")) {
    await loadDashboardData();
    await loadRecentActivities();
  }
  if (path.endsWith("/clock.html")) {
    await wireClockActions();
  }
  if (path.endsWith("/attendance.html")) {
    await wireAttendancePage();
  }
  if (path.endsWith("/leave.html")) {
    await wireLeavePage();
  }
  if (path.endsWith("/payslips.html")) {
    await loadPayslips();
  }
  if (path.endsWith("/profile.html")) {
    await loadProfilePage(profile);
    await wireProfileSave(profile);
  }
  if (path.endsWith("/notifications.html")) {
    await loadNotifications();
  }
});
