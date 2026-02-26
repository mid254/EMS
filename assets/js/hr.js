function hrFmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function hrSetInline(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger)" : "var(--muted)";
}

const hrNotificationsState = {
  items: [],
  filter: "all",
};

async function hrLog(sb, profile, action, entity, details = {}) {
  await sb.from("activity_logs").insert({
    actor_user_id: profile.id,
    action,
    entity,
    details,
  });
}

async function loadHrDashboard(sb) {
  if (!document.getElementById("hrTotalEmployees")) return;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const today = now.toISOString().slice(0, 10);

  const [{ count: totalEmployees }, { count: newThisMonth }, { count: onLeaveToday }, { count: pendingLeaves }, attRes] = await Promise.all([
    sb.from("employees").select("id", { head: true, count: "exact" }),
    sb.from("employees").select("id", { head: true, count: "exact" }).gte("created_at", monthStart).lte("created_at", monthEnd),
    sb.from("leaves").select("id", { head: true, count: "exact" }).lte("start_date", today).gte("end_date", today).eq("status", "approved"),
    sb.from("leaves").select("id", { head: true, count: "exact" }).eq("status", "pending"),
    sb.from("attendance").select("clock_in, clock_out").gte("clock_in", `${today}T00:00:00`).lte("clock_in", `${today}T23:59:59`),
  ]);

  const issues = (attRes.data || []).filter((r) => {
    const inHour = new Date(r.clock_in).getHours();
    const outHour = r.clock_out ? new Date(r.clock_out).getHours() : 23;
    return inHour >= 9 || outHour < 17;
  }).length;

  setText("hrTotalEmployees", String(totalEmployees || 0));
  setText("hrNewEmployeesThisMonth", String(newThisMonth || 0));
  setText("hrOnLeaveToday", String(onLeaveToday || 0));
  setText("hrPendingLeaveRequests", String(pendingLeaves || 0));
  setText("hrAttendanceIssues", String(issues || 0));

  const cards = document.getElementById("hrOverviewCards");
  if (cards) {
    cards.innerHTML = `
      <div class="mini-card"><div class="mini-title">Recent Activity</div><div class="mini-body">${newThisMonth || 0} new employees this month, ${pendingLeaves || 0} leave requests pending.</div></div>
      <div class="mini-card"><div class="mini-title">Attendance Alerts</div><div class="mini-body">${issues || 0} late/early records today.</div></div>
    `;
  }
}

async function loadHrEmployees(sb) {
  const tbody = document.getElementById("employeesBody");
  if (!tbody) return;
  const { data } = await sb
    .from("employees")
    .select("id,work_id,full_name,email,role,created_at,department:departments(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">No employees found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (e) => `<tr>
    <td>${e.work_id || "-"}</td>
    <td>${e.full_name || "-"}</td>
    <td>${e.email || "-"}</td>
    <td>${e.department?.name || "-"}</td>
    <td>${roleLabel(e.role)}</td>
    <td>Active</td>
    <td>${hrFmtDate(e.created_at)}</td>
    <td>-</td>
  </tr>`,
    )
    .join("");
}

async function loadHrAttendance(sb) {
  const tbody = document.getElementById("attendanceRecordsBody");
  if (!tbody) return;
  const [attRes, profilesRes] = await Promise.all([
    sb.from("attendance").select("id,user_id,clock_in,clock_out,created_at").order("clock_in", { ascending: false }).limit(200),
    sb.from("profiles").select("id,full_name"),
  ]);
  const rows = attRes.data || [];
  const profileByUser = new Map((profilesRes.data || []).map((p) => [p.id, p]));
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">No attendance records found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((r) => {
      const inHour = new Date(r.clock_in).getHours();
      const outHour = r.clock_out ? new Date(r.clock_out).getHours() : null;
      const status = inHour >= 9 ? "Late" : "On time";
      const remarks = outHour !== null && outHour < 17 ? "Early checkout" : "-";
      return `<tr>
        <td>${hrFmtDate(r.clock_in)}</td>
        <td>${profileByUser.get(r.user_id)?.full_name || "-"}</td>
        <td>${new Date(r.clock_in).toLocaleTimeString()}</td>
        <td>${r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : "-"}</td>
        <td>${status}</td>
        <td>${remarks}</td>
        <td>-</td>
      </tr>`;
    })
    .join("");
}

async function loadHrLeave(sb, profile) {
  const tbody = document.getElementById("leaveRequestsBody");
  if (!tbody) return;
  const [leaveRes, profileRes, typesRes] = await Promise.all([
    sb.from("leaves").select("id,user_id,leave_type,start_date,end_date,status,created_at").order("created_at", { ascending: false }).limit(200),
    sb.from("profiles").select("id,full_name"),
    sb.from("leave_types").select("id,name,default_days").order("name"),
  ]);
  const leaves = leaveRes.data || [];
  const users = new Map((profileRes.data || []).map((p) => [p.id, p.full_name]));
  if (!leaves.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No leave requests found.</td></tr>`;
  } else {
    tbody.innerHTML = leaves
      .map(
        (l) => `<tr>
      <td>${users.get(l.user_id) || "-"}</td>
      <td>${l.leave_type || "-"}</td>
      <td>${hrFmtDate(l.start_date)}</td>
      <td>${hrFmtDate(l.end_date)}</td>
      <td>${l.status || "-"}</td>
      <td>
        <button class="btn ghost" data-hr-leave-action="approved" data-leave-id="${l.id}">Approve</button>
        <button class="btn ghost" data-hr-leave-action="rejected" data-leave-id="${l.id}">Reject</button>
      </td>
    </tr>`,
      )
      .join("");
  }

  const cards = document.getElementById("hrLeaveTypesCards");
  if (cards) {
    const types = typesRes.data || [];
    cards.innerHTML = types.length
      ? types.map((t) => `<div class="mini-card"><div class="mini-title">${t.name}</div><div class="mini-body">Default days: ${t.default_days}</div></div>`).join("")
      : `<div class="mini-card"><div class="mini-title">Leave Types</div><div class="mini-body">No leave types configured.</div></div>`;
  }

  tbody.querySelectorAll("button[data-hr-leave-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-leave-id");
      const status = btn.getAttribute("data-hr-leave-action");
      const { error } = await sb.from("leaves").update({ status, decided_by: profile.id, decided_at: new Date().toISOString() }).eq("id", id);
      if (!error) {
        await hrLog(sb, profile, `hr_leave_${status}`, "leave", { leave_id: id });
        loadHrLeave(sb, profile);
      }
    });
  });
}

async function loadHrPayroll(sb, profile) {
  const cards = document.getElementById("hrPayrollSummaryCards");
  if (!cards) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const { data } = await sb.from("payroll").select("id,net_pay").gte("period_start", start).lte("period_end", end);
  const rows = data || [];
  const total = rows.reduce((sum, row) => sum + Number(row.net_pay || 0), 0);
  cards.innerHTML = `
    <div class="mini-card"><div class="mini-title">Current Period Payroll</div><div class="mini-body">${total.toLocaleString(undefined, { style: "currency", currency: "KES", maximumFractionDigits: 2 })}</div></div>
    <div class="mini-card"><div class="mini-title">Payslip Records</div><div class="mini-body">${rows.length}</div></div>
  `;

  document.getElementById("hrGeneratePayslipsBtn")?.addEventListener("click", async () => {
    hrSetInline("hrPayrollInlineMsg", "Payslip generation request submitted.");
    await hrLog(sb, profile, "hr_generate_payslips", "payroll", { period_start: start, period_end: end });
  });
  document.getElementById("hrForwardToAccountsBtn")?.addEventListener("click", async () => {
    hrSetInline("hrPayrollInlineMsg", "Payroll forwarded to Accounts queue.");
    await hrLog(sb, profile, "hr_forward_payroll", "payroll", { period_start: start, period_end: end });
  });
}

async function loadHrReports(sb, profile) {
  if (!document.getElementById("hrReportsInlineMsg")) return;
  document.querySelectorAll("button[data-hr-report]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const report = btn.getAttribute("data-hr-report");
      hrSetInline("hrReportsInlineMsg", `Report request queued: ${report}`);
      await hrLog(sb, profile, "hr_report_export", "report", { format: report });
    });
  });
}

async function loadHrPolicies(sb, profile) {
  const policiesCards = document.getElementById("hrPoliciesCards");
  if (!policiesCards) return;
  const [hoursRes, policyRes, complianceRes] = await Promise.all([
    sb.from("working_hours").select("start_time,end_time,working_days").order("updated_at", { ascending: false }).limit(1),
    sb.from("activity_logs").select("details,created_at").eq("entity", "policy").order("created_at", { ascending: false }).limit(20),
    sb.from("activity_logs").select("details,created_at").eq("entity", "compliance").order("created_at", { ascending: false }).limit(20),
  ]);

  const policies = policyRes.data || [];
  policiesCards.innerHTML = policies.length
    ? policies.map((p) => `<div class="mini-card"><div class="mini-title">${p.details?.title || "Policy update"}</div><div class="mini-body">${new Date(p.created_at).toLocaleString()}</div></div>`).join("")
    : `<div class="mini-card"><div class="mini-title">Policies</div><div class="mini-body">No policies posted yet.</div></div>`;

  const working = (hoursRes.data || [])[0];
  if (working) {
    const hoursInput = document.getElementById("hrWorkingHoursDisplay");
    if (hoursInput) hoursInput.value = `${working.start_time} - ${working.end_time} (${working.working_days})`;
  }

  const complianceCards = document.getElementById("hrComplianceCards");
  if (complianceCards) {
    const items = complianceRes.data || [];
    complianceCards.innerHTML = items.length
      ? items.map((c) => `<div class="mini-card"><div class="mini-title">${c.details?.title || "Compliance entry"}</div><div class="mini-body">${new Date(c.created_at).toLocaleString()}</div></div>`).join("")
      : `<div class="mini-card"><div class="mini-title">Compliance</div><div class="mini-body">No compliance records yet.</div></div>`;
  }

  document.getElementById("hrUploadPolicyBtn")?.addEventListener("click", async () => {
    const title = `Policy update ${new Date().toLocaleString()}`;
    const { error } = await sb.from("activity_logs").insert({
      actor_user_id: profile.id,
      action: "hr_policy_uploaded",
      entity: "policy",
      details: { title },
    });
    if (error) {
      hrSetInline("hrPoliciesInlineMsg", error.message || "Unable to record policy update.", true);
      return;
    }
    hrSetInline("hrPoliciesInlineMsg", "Policy entry created.");
    await loadHrPolicies(sb, profile);
  });
}

async function loadHrProfile(sb, profile) {
  if (!document.getElementById("hrProfileEmail")) return;
  const [freshRes, deptRes] = await Promise.all([
    sb.from("profiles").select("full_name,phone,department_id,work_id,role,email").eq("id", profile.id).maybeSingle(),
    sb.from("departments").select("id,name"),
  ]);
  const fresh = freshRes.data || profile;
  const deptById = new Map((deptRes.data || []).map((d) => [d.id, d.name]));

  document.getElementById("hrProfileEmail").value = fresh.email || profile.email || "";
  document.getElementById("hrProfileWorkId").value = fresh.work_id || profile.work_id || "";
  document.getElementById("hrProfileRole").value = roleLabel(fresh.role || profile.role);
  document.getElementById("hrProfileDepartment").value = deptById.get(fresh.department_id) || "-";
  document.getElementById("hrProfileFullName").value = fresh.full_name || "";
  document.getElementById("hrProfilePhone").value = fresh.phone || "";

  document.getElementById("hrUpdateProfileBtn")?.addEventListener("click", async () => {
    const full_name = document.getElementById("hrProfileFullName").value.trim();
    const phone = document.getElementById("hrProfilePhone").value.trim();
    const { error } = await sb.from("profiles").update({ full_name, phone }).eq("id", profile.id);
    if (error) {
      hrSetInline("hrProfileInlineMsg", error.message || "Profile update failed.", true);
      return;
    }
    await hrLog(sb, profile, "hr_profile_updated", "profile", { full_name, phone });
    hrSetInline("hrProfileInlineMsg", "Profile updated.");
  });

  document.getElementById("hrChangePasswordBtn")?.addEventListener("click", async () => {
    const { error } = await sb.auth.resetPasswordForEmail(profile.email);
    if (error) {
      hrSetInline("hrProfileInlineMsg", error.message || "Password reset request failed.", true);
      return;
    }
    hrSetInline("hrProfileInlineMsg", "Password reset email sent.");
  });
}

function hrNotificationTitle(action, entity) {
  const raw = String(action || "Update").replaceAll("_", " ");
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);
  return entity ? `${title} (${entity})` : title;
}

function hrApplyNotificationFilter(filterKey) {
  const list = document.getElementById("employeeNotificationsList");
  if (!list) return;

  ["notifFilterAll", "notifFilterUnread", "notifFilterRead"].forEach((id) => {
    document.getElementById(id)?.classList.remove("active");
  });
  if (filterKey === "unread") document.getElementById("notifFilterUnread")?.classList.add("active");
  else if (filterKey === "read") document.getElementById("notifFilterRead")?.classList.add("active");
  else document.getElementById("notifFilterAll")?.classList.add("active");

  hrNotificationsState.filter = filterKey;
  const filtered = hrNotificationsState.items.filter((item) => {
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
          <div class="notif-item-title">${hrNotificationTitle(item.action, item.entity)}</div>
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

async function hrUpdateNotificationRow(sb, id, patchDetails) {
  const item = hrNotificationsState.items.find((x) => x.id === id);
  if (!item) return false;
  const merged = { ...(item.details || {}), ...(patchDetails || {}) };
  const { error } = await sb.from("activity_logs").update({ details: merged }).eq("id", id);
  if (error) return false;
  item.details = merged;
  item.is_read = !!merged.notification_read;
  item.deleted = !!merged.notification_deleted;
  return true;
}

function wireHrNotificationActions(sb) {
  const list = document.getElementById("employeeNotificationsList");
  if (!list) return;
  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.id;
    if (!id) return;
    if (target.classList.contains("notif-mark-read-btn")) {
      if (await hrUpdateNotificationRow(sb, id, { notification_read: true, notification_read_at: new Date().toISOString() })) {
        hrApplyNotificationFilter(hrNotificationsState.filter);
      }
      return;
    }
    if (target.classList.contains("notif-mark-unread-btn")) {
      if (await hrUpdateNotificationRow(sb, id, { notification_read: false, notification_read_at: null })) {
        hrApplyNotificationFilter(hrNotificationsState.filter);
      }
      return;
    }
    if (target.classList.contains("notif-delete-btn")) {
      if (await hrUpdateNotificationRow(sb, id, { notification_deleted: true, notification_deleted_at: new Date().toISOString() })) {
        hrNotificationsState.items = hrNotificationsState.items.filter((x) => x.id !== id);
        hrApplyNotificationFilter(hrNotificationsState.filter);
      }
    }
  });

  document.getElementById("notifFilterAll")?.addEventListener("click", () => hrApplyNotificationFilter("all"));
  document.getElementById("notifFilterUnread")?.addEventListener("click", () => hrApplyNotificationFilter("unread"));
  document.getElementById("notifFilterRead")?.addEventListener("click", () => hrApplyNotificationFilter("read"));
  document.getElementById("notifMarkAllReadBtn")?.addEventListener("click", async () => {
    const unread = hrNotificationsState.items.filter((x) => !x.is_read);
    await Promise.all(unread.map((x) => hrUpdateNotificationRow(sb, x.id, { notification_read: true, notification_read_at: new Date().toISOString() })));
    hrApplyNotificationFilter(hrNotificationsState.filter);
  });
}

async function loadHrNotifications(sb) {
  if (!document.getElementById("employeeNotificationsList")) return;
  const { data, error } = await sb.from("activity_logs").select("id,action,entity,details,created_at").order("created_at", { ascending: false }).limit(50);
  if (error) {
    document.getElementById("employeeNotificationsList").innerHTML =
      '<div class="mini-card"><div class="mini-title">Error</div><div class="mini-body">Unable to load notifications.</div></div>';
    return;
  }
  hrNotificationsState.items = (data || [])
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
  wireHrNotificationActions(sb);
  hrApplyNotificationFilter("all");
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.hr, Roles.admin]);
  if (!profile) return;
  const sb = window.supabaseClient;
  if (!sb) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main && main.textContent.toLowerCase().includes("welcome")) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub && !sub.textContent.includes("-")) sub.textContent = `${roleLabel(profile.role)} - ${profile.work_id || "-"}`;

  await Promise.allSettled([
    loadHrDashboard(sb),
    loadHrEmployees(sb),
    loadHrAttendance(sb),
    loadHrLeave(sb, profile),
    loadHrPayroll(sb, profile),
    loadHrReports(sb, profile),
    loadHrPolicies(sb, profile),
    loadHrProfile(sb, profile),
    loadHrNotifications(sb),
  ]);
});
