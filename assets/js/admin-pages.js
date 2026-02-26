
function adminSafeText(value, fallback) {
  const text = value == null ? "" : String(value).trim();
  return text || (fallback || "");
}

function adminFormatDateTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

function adminFormatDate(value) {
  if (!value) return "--";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString();
}

function adminGetQuarter(dateLike) {
  const d = new Date(dateLike);
  const month = d.getMonth() + 1;
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

function adminGetPath() {
  return (window.location.pathname || "").toLowerCase();
}

async function adminLogActivity(action, entity, details, notifyAll) {
  const sb = window.supabaseClient;
  if (!sb) return;
  const { data: authData } = await sb.auth.getUser();
  const actor = authData?.user?.id || null;
  const payload = {
    ...(details || {}),
    message: adminSafeText(details?.message, action),
    notify_all: !!notifyAll,
    broadcast_at: notifyAll ? new Date().toISOString() : null,
  };
  await sb.from("activity_logs").insert([{ actor_user_id: actor, action, entity, details: payload }]);
}

async function adminGetProfilesMap(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await window.supabaseClient
    .from("profiles")
    .select("id, full_name, work_id, department_id")
    .in("id", ids);
  const map = new Map();
  (data || []).forEach((row) => map.set(row.id, row));
  return map;
}

async function bindAdminFrame(profile) {
  const name = adminSafeText(profile.full_name, "Admin User");
  const role = roleLabel(profile.role);
  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main && (main.textContent || "").includes("Welcome")) main.textContent = `Welcome, ${name}`;
  if (sub && (sub.textContent || "").includes("overview")) sub.textContent = `${role} - ${adminSafeText(profile.work_id, profile.email)}`;
  document.querySelectorAll(".sidebar-profile-name").forEach((el) => (el.textContent = name));
  document.querySelectorAll(".sidebar-profile-role").forEach((el) => (el.textContent = role));
  document.querySelectorAll(".topbar-profile-name").forEach((el) => (el.textContent = name));
}

async function loadAdminDashboardPanels() {
  const activityEl = document.getElementById("adminDashboardActivityList");
  const payrollEl = document.getElementById("adminDashboardPayrollIds");
  if (!activityEl || !payrollEl || !window.supabaseClient) return;

  const { data: logs } = await window.supabaseClient
    .from("activity_logs")
    .select("action, entity, created_at")
    .order("created_at", { ascending: false })
    .limit(6);
  if (!logs?.length) {
    activityEl.innerHTML = '<div class="mini-card"><div class="mini-title">No recent activity</div><div class="mini-body">No activity logs yet.</div></div>';
  } else {
    activityEl.innerHTML = logs
      .map((row) => `<div class="mini-card"><div class="mini-title">${adminSafeText(row.action, "activity")}</div><div class="mini-body">${adminSafeText(row.entity, "system")} - ${adminFormatDateTime(row.created_at)}</div></div>`)
      .join("");
  }

  const { data: payrollRows } = await window.supabaseClient
    .from("payroll")
    .select("user_id, period_start, period_end, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  const profilesMap = await adminGetProfilesMap((payrollRows || []).map((r) => r.user_id));
  if (!payrollRows?.length) {
    payrollEl.innerHTML = '<div class="mini-card"><div class="mini-title">No payroll confirmations</div><div class="mini-body">No confirmed payroll rows yet.</div></div>';
  } else {
    payrollEl.innerHTML = payrollRows
      .map((row) => {
        const p = profilesMap.get(row.user_id);
        return `<div class="mini-card"><div class="mini-title">${adminSafeText(p?.work_id, "N/A")}</div><div class="mini-body">${adminSafeText(p?.full_name, "Employee")} | ${adminFormatDate(row.period_start)} - ${adminFormatDate(row.period_end)}</div></div>`;
      })
      .join("");
  }
}

const adminNotificationsState = { filter: "all", rows: [] };

function renderAdminNotifications(filterKey) {
  const list = document.getElementById("adminNotificationsList");
  if (!list) return;
  adminNotificationsState.filter = filterKey;
  ["adminNotifFilterAll", "adminNotifFilterUnread", "adminNotifFilterRead"].forEach((id) => {
    document.getElementById(id)?.classList.remove("active");
  });
  if (filterKey === "read") document.getElementById("adminNotifFilterRead")?.classList.add("active");
  else if (filterKey === "unread") document.getElementById("adminNotifFilterUnread")?.classList.add("active");
  else document.getElementById("adminNotifFilterAll")?.classList.add("active");

  const rows = adminNotificationsState.rows.filter((row) => {
    if (filterKey === "read") return !!row.is_read;
    if (filterKey === "unread") return !row.is_read;
    return true;
  });
  if (!rows.length) {
    list.innerHTML = '<div class="mini-card"><div class="mini-title">No notifications</div><div class="mini-body">No notifications for this filter.</div></div>';
    return;
  }

  list.innerHTML = rows
    .map((row) => {
      const stateClass = row.is_read ? "read" : "unread";
      const markBtn = row.is_read
        ? `<button class="btn ghost admin-notif-mark-unread" type="button" data-id="${row.id}">Mark as Unread</button>`
        : `<button class="btn ghost admin-notif-mark-read" type="button" data-id="${row.id}">Mark as Read</button>`;
      return `<div class="notif-item ${stateClass}"><div class="notif-item-head"><div class="notif-item-title">${adminSafeText(row.action, "activity")}</div><div class="notif-item-time">${adminFormatDateTime(row.created_at)}</div></div><div class="notif-item-body">${adminSafeText(row.message, adminSafeText(row.entity, "system"))}</div><div class="notif-item-actions">${markBtn}<button class="btn ghost admin-notif-delete" type="button" data-id="${row.id}">Delete</button></div></div>`;
    })
    .join("");
}

async function patchAdminNotification(id, patchDetails) {
  const row = adminNotificationsState.rows.find((r) => r.id === id);
  if (!row) return;
  const details = { ...(row.details || {}), ...(patchDetails || {}) };
  const { error } = await window.supabaseClient.from("activity_logs").update({ details }).eq("id", id);
  if (error) throw error;
  row.details = details;
  row.is_read = !!details.admin_notification_read;
  row.deleted = !!details.admin_notification_deleted;
}

function wireAdminNotificationsActions() {
  const list = document.getElementById("adminNotificationsList");
  if (!list) return;
  list.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.id;
    if (!id) return;
    if (target.classList.contains("admin-notif-mark-read")) {
      await patchAdminNotification(id, { admin_notification_read: true, admin_notification_read_at: new Date().toISOString() });
      renderAdminNotifications(adminNotificationsState.filter);
    } else if (target.classList.contains("admin-notif-mark-unread")) {
      await patchAdminNotification(id, { admin_notification_read: false, admin_notification_read_at: null });
      renderAdminNotifications(adminNotificationsState.filter);
    } else if (target.classList.contains("admin-notif-delete")) {
      await patchAdminNotification(id, { admin_notification_deleted: true, admin_notification_deleted_at: new Date().toISOString() });
      adminNotificationsState.rows = adminNotificationsState.rows.filter((r) => r.id !== id);
      renderAdminNotifications(adminNotificationsState.filter);
    }
  });

  document.getElementById("adminNotifFilterAll")?.addEventListener("click", () => renderAdminNotifications("all"));
  document.getElementById("adminNotifFilterUnread")?.addEventListener("click", () => renderAdminNotifications("unread"));
  document.getElementById("adminNotifFilterRead")?.addEventListener("click", () => renderAdminNotifications("read"));
  document.getElementById("adminNotifMarkAllRead")?.addEventListener("click", async () => {
    const unread = adminNotificationsState.rows.filter((r) => !r.is_read);
    await Promise.all(
      unread.map((row) =>
        patchAdminNotification(row.id, { admin_notification_read: true, admin_notification_read_at: new Date().toISOString() })
      )
    );
    renderAdminNotifications(adminNotificationsState.filter);
  });
}

async function loadAdminNotifications() {
  if (!document.getElementById("adminNotificationsList")) return;
  const { data, error } = await window.supabaseClient
    .from("activity_logs")
    .select("id, action, entity, details, created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) {
    document.getElementById("adminNotificationsList").innerHTML =
      '<div class="mini-card"><div class="mini-title">Error</div><div class="mini-body">Unable to load notifications.</div></div>';
    return;
  }
  adminNotificationsState.rows = (data || [])
    .map((row) => ({
      ...row,
      message: row.details?.message || row.details?.reason || row.details?.status || "",
      is_read: !!row.details?.admin_notification_read,
      deleted: !!row.details?.admin_notification_deleted,
    }))
    .filter((row) => !row.deleted);
  wireAdminNotificationsActions();
  renderAdminNotifications("all");
}

function renderAuditTableRows(targetId, rows) {
  const tbody = document.getElementById(targetId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">No records found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((row) => `<tr><td>${adminFormatDateTime(row.created_at)}</td><td>${adminSafeText(row.user_name, "System")}</td><td>${adminSafeText(row.action, "--")}</td><td>${adminSafeText(row.details_text, "--")}</td></tr>`)
    .join("");
}

async function loadAdminActivityLogs() {
  if (!document.getElementById("employeeActionsBody")) return;
  const { data, error } = await window.supabaseClient
    .from("activity_logs")
    .select("id, actor_user_id, action, entity, details, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return;
  const profilesMap = await adminGetProfilesMap((data || []).map((r) => r.actor_user_id));
  const rows = (data || []).map((row) => ({
    ...row,
    quarter: adminGetQuarter(row.created_at),
    user_name: adminSafeText(profilesMap.get(row.actor_user_id)?.full_name, "System"),
    details_text: JSON.stringify(row.details || {}).slice(0, 120),
  }));

  const buildByCategory = (category, quarterFilter) =>
    rows.filter((row) => {
      if (quarterFilter && row.quarter !== quarterFilter) return false;
      if (category === "employee") return row.entity === "employee" || row.entity === "profile" || String(row.action).includes("employee");
      if (category === "leave") return row.entity === "leave" || String(row.action).includes("leave");
      if (category === "payroll") return row.entity === "payroll" || String(row.action).includes("payroll");
      return String(row.action).includes("login") || String(row.action).includes("sign_in");
    });

  const refresh = () => {
    renderAuditTableRows("employeeActionsBody", buildByCategory("employee", document.getElementById("employeeActionsQuarter")?.value || ""));
    renderAuditTableRows("leaveApprovalsBody", buildByCategory("leave", document.getElementById("leaveApprovalsQuarter")?.value || ""));
    renderAuditTableRows("payrollActionsBody", buildByCategory("payroll", document.getElementById("payrollActionsQuarter")?.value || ""));
    renderAuditTableRows("loginHistoryBody", buildByCategory("login", document.getElementById("loginHistoryQuarter")?.value || ""));
  };

  ["employeeActionsQuarter", "leaveApprovalsQuarter", "payrollActionsQuarter", "loginHistoryQuarter"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", refresh);
  });
  refresh();
}

async function loadAdminLeavePage() {
  const tableBody = document.getElementById("adminLeaveRequestsBody");
  if (!tableBody) return;
  const deptFilter = document.getElementById("adminLeaveDepartmentFilter");
  const { data: departments } = await window.supabaseClient.from("departments").select("id, name").order("name");
  if (deptFilter) {
    deptFilter.innerHTML = '<option value="">All departments</option>' + (departments || []).map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  }

  const render = async () => {
    const { data: leaves } = await window.supabaseClient
      .from("leaves")
      .select("id, user_id, leave_type, start_date, end_date, reason, status, created_at")
      .order("created_at", { ascending: false });
    const profilesMap = await adminGetProfilesMap((leaves || []).map((l) => l.user_id));
    const deptMap = new Map((departments || []).map((d) => [d.id, d.name]));
    const filtered = (leaves || []).filter((row) => {
      const selected = deptFilter?.value || "";
      if (!selected) return true;
      return profilesMap.get(row.user_id)?.department_id === selected;
    });

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">No leave requests found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered
      .map((row) => {
        const p = profilesMap.get(row.user_id);
        const dept = deptMap.get(p?.department_id) || "Unassigned";
        const actions =
          row.status === "pending"
            ? `<button class="btn ghost admin-leave-approve" type="button" data-id="${row.id}">Approve</button> <button class="btn ghost admin-leave-reject" type="button" data-id="${row.id}">Reject</button>`
            : "--";
        return `<tr><td>${adminSafeText(p?.full_name, "Employee")}</td><td>${dept}</td><td>${adminSafeText(row.leave_type, "Leave")}</td><td>${adminFormatDate(row.start_date)}</td><td>${adminFormatDate(row.end_date)}</td><td>${adminSafeText(row.status, "pending")}</td><td>${actions}</td></tr>`;
      })
      .join("");

    const balancesEl = document.getElementById("adminLeaveBalancesList");
    if (balancesEl) {
      const usedByUser = new Map();
      filtered
        .filter((row) => row.status === "approved")
        .forEach((row) => {
          const start = new Date(`${row.start_date}T00:00:00`);
          const end = new Date(`${row.end_date}T00:00:00`);
          const days = Math.max(0, Math.floor((end - start) / 86400000) + 1);
          usedByUser.set(row.user_id, (usedByUser.get(row.user_id) || 0) + days);
        });
      const cards = [...usedByUser.entries()];
      balancesEl.innerHTML = cards.length
        ? cards.map(([uid, days]) => `<div class="mini-card"><div class="mini-title">${adminSafeText(profilesMap.get(uid)?.full_name, "Employee")}</div><div class="mini-body">Used ${days} day(s) this year</div></div>`).join("")
        : '<div class="mini-card"><div class="mini-title">No approved leave</div><div class="mini-body">No leave balance usage data yet.</div></div>';
    }
  };

  deptFilter?.addEventListener("change", render);
  tableBody.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const id = t.dataset.id;
    if (!id) return;
    if (!t.classList.contains("admin-leave-approve") && !t.classList.contains("admin-leave-reject")) return;
    const status = t.classList.contains("admin-leave-approve") ? "approved" : "rejected";
    const { data: authData } = await window.supabaseClient.auth.getUser();
    await window.supabaseClient
      .from("leaves")
      .update({ status, decided_by: authData?.user?.id || null, decided_at: new Date().toISOString() })
      .eq("id", id);
    await adminLogActivity(`leave_${status}`, "leave", { leave_id: id, status }, true);
    await render();
  });
  await render();
}

let adminPayrollCache = [];

function downloadCsv(filename, rows, headers) {
  const keys = headers.map((h) => (typeof h === "string" ? h : h.key));
  const labels = headers.map((h) => (typeof h === "string" ? h : h.label));
  const csvRows = [labels.join(",")];
  rows.forEach((row) => {
    csvRows.push(
      keys
        .map((key) => {
          const value = row[key] == null ? "" : String(row[key]);
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(",")
    );
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadAdminPayrollPage() {
  const tbody = document.getElementById("adminPayrollSummaryBody");
  if (!tbody) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const { data } = await window.supabaseClient
    .from("payroll")
    .select("id, user_id, period_start, period_end, net_pay, created_at")
    .order("created_at", { ascending: false });
  adminPayrollCache = data || [];
  const profilesMap = await adminGetProfilesMap(adminPayrollCache.map((x) => x.user_id));
  tbody.innerHTML = adminPayrollCache.length
    ? adminPayrollCache
        .map((row) => {
          const p = profilesMap.get(row.user_id);
          return `<tr><td>${adminSafeText(p?.work_id, "N/A")}</td><td>${adminSafeText(p?.full_name, "Employee")}</td><td>${adminFormatDate(row.period_start)} - ${adminFormatDate(row.period_end)}</td><td>${Number(row.net_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${adminFormatDateTime(row.created_at)}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">No payroll records available.</td></tr>';

  const currentMonthRows = adminPayrollCache.filter((r) => r.period_start >= start && r.period_end <= end);
  const total = currentMonthRows.reduce((sum, r) => sum + Number(r.net_pay || 0), 0);
  setText("adminPayrollTotalCost", total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  setText("adminPayrollRecordCount", String(currentMonthRows.length));
  setText("adminPayrollStatus", currentMonthRows.length ? "Payroll records available" : "No payroll generated");

  document.getElementById("adminGeneratePayrollBtn")?.addEventListener("click", async () => {
    const pStart = prompt("Enter payroll period start date (YYYY-MM-DD):", start);
    if (!pStart) return;
    const pEnd = prompt("Enter payroll period end date (YYYY-MM-DD):", end);
    if (!pEnd) return;
    const basic = Number(prompt("Default basic salary for generated rows:", "0") || "0");
    const allowances = Number(prompt("Default allowances:", "0") || "0");
    const deductions = Number(prompt("Default deductions:", "0") || "0");
    const { data: employees } = await window.supabaseClient.from("employees").select("auth_user_id").not("auth_user_id", "is", null);
    const existingSet = new Set(
      (adminPayrollCache || [])
        .filter((r) => r.period_start === pStart && r.period_end === pEnd)
        .map((r) => r.user_id)
    );
    const rows = (employees || [])
      .map((e) => e.auth_user_id)
      .filter((id) => id && !existingSet.has(id))
      .map((userId) => ({ user_id: userId, period_start: pStart, period_end: pEnd, basic_salary: basic, allowances, deductions }));
    if (!rows.length) {
      alert("No new employees found for payroll generation in selected period.");
      return;
    }
    await window.supabaseClient.from("payroll").insert(rows);
    await adminLogActivity("payroll_generated", "payroll", { period_start: pStart, period_end: pEnd, records: rows.length }, true);
    alert(`Payroll generated for ${rows.length} employee(s).`);
    await loadAdminPayrollPage();
  });

  document.getElementById("adminDownloadPayrollBtn")?.addEventListener("click", () => {
    const rows = adminPayrollCache.map((r) => ({ period_start: r.period_start, period_end: r.period_end, net_pay: r.net_pay, created_at: r.created_at }));
    downloadCsv("admin-payroll-report.csv", rows, ["period_start", "period_end", "net_pay", "created_at"]);
  });
}

let adminReportCache = { attendance: [], leaves: [], payroll: [], employees: [] };

function renderBarChart(containerId, rows) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="muted">No data available.</div>';
    return;
  }
  const numeric = rows.map((r) => Number(String(r.value).replace(/,/g, "")) || 0);
  const max = Math.max(...numeric, 1);
  el.innerHTML = rows
    .map((row, i) => {
      const width = Math.max(4, Math.round((numeric[i] / max) * 100));
      return `<div class="bar-row"><span>${row.label}</span><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><span class="bar-value">${row.value}</span></div>`;
    })
    .join("");
}

async function loadAdminReportsPage() {
  if (!document.getElementById("adminReportsApplyBtn")) return;
  const sb = window.supabaseClient;
  const { data: departments } = await sb.from("departments").select("id, name").order("name");
  const deptSelect = document.getElementById("adminReportsDepartment");
  if (deptSelect) {
    deptSelect.innerHTML = '<option value="">All</option>' + (departments || []).map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  }

  const apply = async () => {
    const from = document.getElementById("adminReportsFromDate")?.value || "";
    const to = document.getElementById("adminReportsToDate")?.value || "";
    const deptId = deptSelect?.value || "";
    const role = document.getElementById("adminReportsRole")?.value || "";
    let attendanceQ = sb.from("attendance").select("user_id, clock_in");
    if (from) attendanceQ = attendanceQ.gte("clock_in", `${from}T00:00:00`);
    if (to) attendanceQ = attendanceQ.lte("clock_in", `${to}T23:59:59`);
    const { data: attendance } = await attendanceQ;
    let leaveQ = sb.from("leaves").select("user_id, status, leave_type, start_date, end_date");
    if (from) leaveQ = leaveQ.gte("start_date", from);
    if (to) leaveQ = leaveQ.lte("end_date", to);
    const { data: leaves } = await leaveQ;
    let payrollQ = sb.from("payroll").select("user_id, net_pay, period_start, period_end");
    if (from) payrollQ = payrollQ.gte("period_start", from);
    if (to) payrollQ = payrollQ.lte("period_end", to);
    const { data: payroll } = await payrollQ;
    let profilesQ = sb.from("profiles").select("id, full_name, role, department_id");
    if (role) profilesQ = profilesQ.eq("role", role);
    if (deptId) profilesQ = profilesQ.eq("department_id", deptId);
    const { data: profiles } = await profilesQ;
    const profileSet = new Set((profiles || []).map((p) => p.id));
    adminReportCache = {
      attendance: (attendance || []).filter((r) => (profileSet.size ? profileSet.has(r.user_id) : true)),
      leaves: (leaves || []).filter((r) => (profileSet.size ? profileSet.has(r.user_id) : true)),
      payroll: (payroll || []).filter((r) => (profileSet.size ? profileSet.has(r.user_id) : true)),
      employees: profiles || [],
    };

    const attendanceByDay = new Map();
    adminReportCache.attendance.forEach((row) => {
      const day = String(row.clock_in || "").slice(0, 10);
      if (!day) return;
      attendanceByDay.set(day, (attendanceByDay.get(day) || 0) + 1);
    });
    renderBarChart("adminAttendanceChart", [...attendanceByDay.entries()].slice(-10).map(([label, value]) => ({ label, value })));
    const leaveByStatus = new Map();
    adminReportCache.leaves.forEach((row) => {
      const key = adminSafeText(row.status, "unknown");
      leaveByStatus.set(key, (leaveByStatus.get(key) || 0) + 1);
    });
    renderBarChart("adminLeaveChart", [...leaveByStatus.entries()].map(([label, value]) => ({ label, value })));
    const payrollByPeriod = new Map();
    adminReportCache.payroll.forEach((row) => {
      const key = `${row.period_start} to ${row.period_end}`;
      payrollByPeriod.set(key, (payrollByPeriod.get(key) || 0) + Number(row.net_pay || 0));
    });
    renderBarChart("adminPayrollChart", [...payrollByPeriod.entries()].slice(-8).map(([label, value]) => ({ label, value: Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }) })));
    const statsEl = document.getElementById("adminReportStatsCards");
    if (statsEl) {
      const payrollTotal = adminReportCache.payroll.reduce((sum, r) => sum + Number(r.net_pay || 0), 0);
      statsEl.innerHTML = `<div class="mini-card"><div class="mini-title">Employees</div><div class="mini-body">${adminReportCache.employees.length}</div></div><div class="mini-card"><div class="mini-title">Attendance Rows</div><div class="mini-body">${adminReportCache.attendance.length}</div></div><div class="mini-card"><div class="mini-title">Leave Rows</div><div class="mini-body">${adminReportCache.leaves.length}</div></div><div class="mini-card"><div class="mini-title">Payroll Total</div><div class="mini-body">${payrollTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>`;
    }
  };

  document.getElementById("adminReportsApplyBtn")?.addEventListener("click", apply);
  document.getElementById("adminReportsResetBtn")?.addEventListener("click", async () => {
    document.getElementById("adminReportsFromDate").value = "";
    document.getElementById("adminReportsToDate").value = "";
    document.getElementById("adminReportsDepartment").value = "";
    document.getElementById("adminReportsRole").value = "";
    await apply();
  });
  document.getElementById("adminExportAttendanceBtn")?.addEventListener("click", () => downloadCsv("attendance-report.csv", adminReportCache.attendance, ["user_id", "clock_in"]));
  document.getElementById("adminExportLeaveBtn")?.addEventListener("click", () => downloadCsv("leave-report.csv", adminReportCache.leaves, ["user_id", "status", "leave_type", "start_date", "end_date"]));
  document.getElementById("adminExportPayrollBtn")?.addEventListener("click", () => downloadCsv("payroll-report.csv", adminReportCache.payroll, ["user_id", "period_start", "period_end", "net_pay"]));
  await apply();
}

function setMiniCards(containerId, cards) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!cards.length) {
    el.innerHTML = '<div class="mini-card"><div class="mini-title">No data</div><div class="mini-body">No records available.</div></div>';
    return;
  }
  el.innerHTML = cards
    .map((card) => `<div class="mini-card" style="min-width:260px"><div class="mini-title">${card.title}</div><div class="mini-body">${card.body}</div></div>`)
    .join("");
}

async function loadAdminAttendancePage() {
  if (!document.getElementById("adminAttPresentToday")) return;
  const sb = window.supabaseClient;
  if (!sb) return;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const [attRes, empRes] = await Promise.all([
    sb.from("attendance").select("user_id, clock_in, clock_out").gte("clock_in", start).lte("clock_in", end),
    sb.from("employees").select("auth_user_id, full_name, department_id"),
  ]);

  const attendanceRows = attRes.data || [];
  const employees = (empRes.data || []).filter((e) => e.auth_user_id);
  const employeesById = new Map(employees.map((e) => [e.auth_user_id, e]));
  const presentSet = new Set(attendanceRows.map((r) => r.user_id).filter(Boolean));

  const lateThresholdHour = 9;
  const earlyThresholdHour = 17;
  const lateRows = attendanceRows.filter((r) => new Date(r.clock_in).getHours() >= lateThresholdHour);
  const earlyRows = attendanceRows.filter((r) => r.clock_out && new Date(r.clock_out).getHours() < earlyThresholdHour);
  const presentCount = presentSet.size;
  const absentCount = Math.max(employees.length - presentCount, 0);

  setText("adminAttPresentToday", String(presentCount));
  setText("adminAttLateArrivals", String(lateRows.length));
  setText("adminAttEarlyCheckouts", String(earlyRows.length));
  setText("adminAttAbsentToday", String(absentCount));

  const openCount = attendanceRows.filter((r) => !r.clock_out).length;
  const completedCount = attendanceRows.filter((r) => !!r.clock_out).length;
  setMiniCards("adminTodayAttendanceSummary", [
    { title: "Present Employees", body: `${presentCount} employee(s) clocked in today.` },
    { title: "Open Sessions", body: `${openCount} still clocked in.` },
    { title: "Completed Sessions", body: `${completedCount} completed sessions today.` },
    { title: "Early Checkouts", body: `${earlyRows.length} checked out before ${earlyThresholdHour}:00.` },
  ]);

  const { data: departments } = await sb.from("departments").select("id, name").order("name");
  const deptMap = new Map((departments || []).map((d) => [d.id, d.name]));
  const deptStats = new Map();
  employees.forEach((e) => {
    const key = e.department_id || "none";
    if (!deptStats.has(key)) deptStats.set(key, { total: 0, present: 0 });
    deptStats.get(key).total += 1;
  });
  attendanceRows.forEach((r) => {
    const emp = employeesById.get(r.user_id);
    if (!emp) return;
    const key = emp.department_id || "none";
    if (!deptStats.has(key)) deptStats.set(key, { total: 0, present: 0 });
    deptStats.get(key).present += 1;
  });
  const deptCards = [...deptStats.entries()].map(([deptId, v]) => ({
    title: deptMap.get(deptId) || "Unassigned",
    body: `Present: ${v.present} / ${v.total} | Absent: ${Math.max(v.total - v.present, 0)}`,
  }));
  setMiniCards("adminDepartmentAttendance", deptCards);

  const lateCards = lateRows
    .slice(0, 20)
    .map((r) => {
      const emp = employeesById.get(r.user_id);
      const dept = deptMap.get(emp?.department_id) || "Unassigned";
      return {
        title: adminSafeText(emp?.full_name, "Employee"),
        body: `Clock-in: ${adminFormatDateTime(r.clock_in)} | Dept: ${dept}`,
      };
    });
  setMiniCards("adminLateArrivalsList", lateCards);

  const inlineMsg = document.getElementById("adminAttInlineMsg");
  document.getElementById("adminAttApproveCorrectionsBtn")?.addEventListener("click", async () => {
    await adminLogActivity("attendance_corrections_reviewed", "attendance", { message: "Admin reviewed attendance corrections." }, true);
    if (inlineMsg) inlineMsg.textContent = "Attendance correction review action has been recorded.";
  });
  document.getElementById("adminAttExportReportBtn")?.addEventListener("click", () => {
    const exportRows = attendanceRows.map((r) => ({
      user_id: r.user_id,
      clock_in: r.clock_in,
      clock_out: r.clock_out || "",
      status: r.clock_out ? "completed" : "open",
    }));
    downloadCsv("admin-attendance-report.csv", exportRows, ["user_id", "clock_in", "clock_out", "status"]);
    if (inlineMsg) inlineMsg.textContent = "Attendance report exported.";
  });
}

async function renderSettingsCards() {
  const sb = window.supabaseClient;
  const [depsRes, rolesRes, leaveTypesRes, workRes, holRes] = await Promise.all([
    sb.from("departments").select("id, name").order("name"),
    sb.from("job_roles").select("id, name").order("name"),
    sb.from("leave_types").select("id, name, default_days").order("name"),
    sb.from("working_hours").select("id, start_time, end_time, working_days").order("updated_at", { ascending: false }).limit(1),
    sb.from("holidays").select("id, holiday_date, name").eq("country_code", "KE").gte("holiday_date", new Date().toISOString().slice(0, 10)).order("holiday_date"),
  ]);
  const deps = depsRes.data || [];
  const roles = rolesRes.data || [];
  const leaveTypes = leaveTypesRes.data || [];
  const working = workRes.data?.[0] || null;
  const holidays = holRes.data || [];

  const depEl = document.getElementById("settingsDepartmentsList");
  if (depEl) depEl.innerHTML = deps.length ? deps.map((d) => `<div class="mini-card"><div class="mini-title">${d.name}</div><div class="mini-body">Department</div></div>`).join("") : '<div class="mini-card"><div class="mini-title">No departments</div><div class="mini-body">Add a department to get started.</div></div>';
  const roleEl = document.getElementById("settingsJobRolesList");
  if (roleEl) roleEl.innerHTML = roles.length ? roles.map((r) => `<div class="mini-card"><div class="mini-title">${r.name}</div><div class="mini-body">Job role</div></div>`).join("") : '<div class="mini-card"><div class="mini-title">No job roles</div><div class="mini-body">Add a role to get started.</div></div>';
  const leaveEl = document.getElementById("settingsLeaveTypesList");
  if (leaveEl) leaveEl.innerHTML = leaveTypes.length ? leaveTypes.map((l) => `<div class="mini-card"><div class="mini-title">${l.name}</div><div class="mini-body">Default days: ${l.default_days}</div></div>`).join("") : '<div class="mini-card"><div class="mini-title">No leave types</div><div class="mini-body">Add leave types to configure policies.</div></div>';
  if (working) {
    document.getElementById("settingsWorkStartTime").value = working.start_time || "";
    document.getElementById("settingsWorkEndTime").value = working.end_time || "";
    document.getElementById("settingsWorkingDays").value = working.working_days || "Monday - Friday";
  }
  const holBody = document.getElementById("holidaysBody");
  if (holBody) holBody.innerHTML = holidays.length ? holidays.map((h) => `<tr><td>${adminFormatDate(h.holiday_date)}</td><td>${adminSafeText(h.name, "Holiday")}</td><td><button class="btn ghost settings-remove-holiday" type="button" data-id="${h.id}">Delete</button></td></tr>`).join("") : '<tr><td colspan="3" class="muted" style="text-align:center;padding:18px">No upcoming holidays configured.</td></tr>';
}

async function syncKenyaUpcomingHolidays() {
  const year = new Date().getFullYear();
  const known = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-05-01`, name: "Labour Day" },
    { date: `${year}-06-01`, name: "Madaraka Day" },
    { date: `${year}-10-20`, name: "Mashujaa Day" },
    { date: `${year}-12-12`, name: "Jamhuri Day" },
    { date: `${year}-12-25`, name: "Christmas Day" },
    { date: `${year}-12-26`, name: "Boxing Day" },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const rows = known.filter((h) => h.date >= today).map((h) => ({ holiday_date: h.date, name: h.name, country_code: "KE" }));
  if (!rows.length) return 0;
  const { error } = await window.supabaseClient.from("holidays").upsert(rows, { onConflict: "holiday_date,name,country_code" });
  if (error) throw error;
  return rows.length;
}

async function wireAdminSettingsPage() {
  if (!document.getElementById("settingsAddDepartmentBtn")) return;
  await renderSettingsCards();
  document.getElementById("settingsAddDepartmentBtn")?.addEventListener("click", async () => {
    const name = prompt("Enter department name:");
    if (!name) return;
    alert(`Department to add:\nName: ${name}`);
    await window.supabaseClient.from("departments").insert([{ name: name.trim() }]);
    await adminLogActivity("department_created", "settings", { message: `New department created: ${name}` }, true);
    await renderSettingsCards();
  });
  document.getElementById("settingsAddJobRoleBtn")?.addEventListener("click", async () => {
    const name = prompt("Enter job role name:");
    if (!name) return;
    alert(`Job role details:\nRole: ${name}`);
    await window.supabaseClient.from("job_roles").insert([{ name: name.trim() }]);
    await adminLogActivity("job_role_created", "settings", { message: `New job role added: ${name}` }, true);
    await renderSettingsCards();
  });
  document.getElementById("settingsAddLeaveTypeBtn")?.addEventListener("click", async () => {
    const name = prompt("Enter leave type name:");
    if (!name) return;
    const defaultDays = Number(prompt("Enter default leave days:", "0") || "0");
    alert(`Leave type details:\nName: ${name}\nDefault days: ${defaultDays}`);
    await window.supabaseClient.from("leave_types").insert([{ name: name.trim(), default_days: defaultDays }]);
    await adminLogActivity("leave_type_created", "settings", { message: `New leave type added: ${name}`, default_days: defaultDays }, true);
    await renderSettingsCards();
  });
  document.getElementById("settingsSaveWorkingHoursBtn")?.addEventListener("click", async () => {
    const start = document.getElementById("settingsWorkStartTime").value;
    const end = document.getElementById("settingsWorkEndTime").value;
    const workingDays = document.getElementById("settingsWorkingDays").value;
    alert(`Working hours details:\nStart: ${start}\nEnd: ${end}\nDays: ${workingDays}`);
    const payload = { start_time: start, end_time: end, working_days: workingDays };
    const { data: current } = await window.supabaseClient.from("working_hours").select("id").limit(1).maybeSingle();
    if (current?.id) await window.supabaseClient.from("working_hours").update(payload).eq("id", current.id);
    else await window.supabaseClient.from("working_hours").insert([payload]);
    await adminLogActivity("working_hours_updated", "settings", { message: "Working hours updated", ...payload }, true);
    await renderSettingsCards();
  });
  document.getElementById("settingsAddHolidayBtn")?.addEventListener("click", async () => {
    const date = prompt("Enter holiday date (YYYY-MM-DD):");
    if (!date) return;
    const name = prompt("Enter holiday name:");
    if (!name) return;
    alert(`Holiday details:\nDate: ${date}\nName: ${name}`);
    await window.supabaseClient.from("holidays").insert([{ holiday_date: date, name, country_code: "KE" }]);
    await adminLogActivity("holiday_added", "settings", { message: `Holiday added: ${name}`, holiday_date: date }, true);
    await renderSettingsCards();
  });
  document.getElementById("settingsSyncKenyaHolidaysBtn")?.addEventListener("click", async () => {
    const count = await syncKenyaUpcomingHolidays();
    alert(`Synced ${count} Kenya upcoming holiday record(s).`);
    await adminLogActivity("holidays_synced", "settings", { message: `Kenya holidays synced: ${count}` }, true);
    await renderSettingsCards();
  });
  document.getElementById("holidaysBody")?.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("settings-remove-holiday")) return;
    const id = target.dataset.id;
    if (!id) return;
    await window.supabaseClient.from("holidays").delete().eq("id", id);
    await adminLogActivity("holiday_deleted", "settings", { message: `Holiday removed: ${id}` }, true);
    await renderSettingsCards();
  });
}

function wireAdminBell() {
  const btn = document.querySelector('button.icon-button[aria-label="Notifications"]');
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (window.location.pathname.includes("/dashboards/admin/")) window.location.href = "/dashboards/admin/notifications.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const path = adminGetPath();
  if (!path.includes("/dashboards/admin/")) return;
  const profile = await requireRole([Roles.admin]);
  if (!profile) return;
  await bindAdminFrame(profile);
  wireAdminBell();
  if (path.endsWith("/dashboard.html")) await loadAdminDashboardPanels();
  if (path.endsWith("/notifications.html")) await loadAdminNotifications();
  if (path.endsWith("/activity-logs.html")) await loadAdminActivityLogs();
  if (path.endsWith("/leave.html")) await loadAdminLeavePage();
  if (path.endsWith("/attendance.html")) await loadAdminAttendancePage();
  if (path.endsWith("/payroll.html")) await loadAdminPayrollPage();
  if (path.endsWith("/reports.html")) await loadAdminReportsPage();
  if (path.endsWith("/settings.html")) await wireAdminSettingsPage();
});
