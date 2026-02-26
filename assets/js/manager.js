function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function setInline(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function logMdActivity(sb, profile, action, entity, details = {}) {
  await sb.from("activity_logs").insert({
    actor_user_id: profile.id,
    action,
    entity,
    details,
  });
}

function wireWelcome(profile) {
  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main && main.textContent.toLowerCase().includes("welcome")) {
    main.textContent = `Welcome, ${profile.full_name}`;
  }
  if (sub && !sub.textContent.includes("-")) {
    sub.textContent = `${roleLabel(profile.role)} - ${profile.work_id || "-"}`;
  }
}

async function loadMdDashboard(sb) {
  if (!document.getElementById("mdTotalEmployees")) return;
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: totalEmployees }, { count: totalDepartments }, { count: presentToday }, { count: onLeaveToday }, { count: pendingApprovals }] =
    await Promise.all([
      sb.from("employees").select("id", { head: true, count: "exact" }),
      sb.from("departments").select("id", { head: true, count: "exact" }),
      sb.from("attendance").select("id", { head: true, count: "exact" }).gte("clock_in", `${today}T00:00:00`).lte("clock_in", `${today}T23:59:59`),
      sb.from("leaves").select("id", { head: true, count: "exact" }).lte("start_date", today).gte("end_date", today).eq("status", "approved"),
      sb.from("leaves").select("id", { head: true, count: "exact" }).eq("status", "pending"),
    ]);

  const compliance = totalEmployees ? Math.round(((presentToday || 0) / totalEmployees) * 100) : 0;
  setText("mdTotalEmployees", String(totalEmployees || 0));
  setText("mdActiveDepartments", String(totalDepartments || 0));
  setText("mdPresentToday", String(presentToday || 0));
  setText("mdOnLeaveToday", String(onLeaveToday || 0));
  setText("mdPendingApprovals", String(pendingApprovals || 0));
  setText("mdAttendanceCompliance", `${compliance}%`);

  const cards = document.getElementById("mdOverviewCards");
  if (!cards) return;
  cards.innerHTML = `
    <div class="mini-card"><div class="mini-title">Company Performance</div><div class="mini-body">Attendance compliance is ${compliance}%. Pending approvals: ${pendingApprovals || 0}.</div></div>
    <div class="mini-card"><div class="mini-title">Department Health</div><div class="mini-body">Departments: ${totalDepartments || 0}. Employees on leave today: ${onLeaveToday || 0}.</div></div>
  `;
}

async function loadMdDepartments(sb) {
  const tbody = document.getElementById("mdDepartmentsBody");
  if (!tbody) return;

  const [deptRes, empRes, profRes, attRes] = await Promise.all([
    sb.from("departments").select("id,name").order("name"),
    sb.from("employees").select("id,department_id"),
    sb.from("profiles").select("id,full_name,role,department_id"),
    sb
      .from("attendance")
      .select("user_id,clock_in")
      .gte("clock_in", `${new Date().toISOString().slice(0, 10)}T00:00:00`)
      .lte("clock_in", `${new Date().toISOString().slice(0, 10)}T23:59:59`),
  ]);

  const departments = deptRes.data || [];
  const employees = empRes.data || [];
  const profiles = profRes.data || [];
  const attendance = attRes.data || [];
  const presentByDept = new Map();

  attendance.forEach((row) => {
    const p = profiles.find((x) => x.id === row.user_id);
    if (!p?.department_id) return;
    presentByDept.set(p.department_id, (presentByDept.get(p.department_id) || 0) + 1);
  });

  if (!departments.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">No departments found.</td></tr>`;
    return;
  }

  tbody.innerHTML = departments
    .map((dept) => {
      const count = employees.filter((e) => e.department_id === dept.id).length;
      const present = presentByDept.get(dept.id) || 0;
      const rate = count ? Math.round((present / count) * 100) : 0;
      const supervisor = profiles.find((p) => p.department_id === dept.id && p.role === Roles.supervisor);
      return `<tr>
        <td>${dept.name}</td>
        <td>${count}</td>
        <td>${rate}%</td>
        <td>${supervisor?.full_name || "-"}</td>
      </tr>`;
    })
    .join("");

  const statsCards = document.getElementById("mdDepartmentStatsCards");
  if (!statsCards) return;
  const top = departments
    .slice()
    .sort((a, b) => (presentByDept.get(b.id) || 0) - (presentByDept.get(a.id) || 0))
    .slice(0, 3);
  statsCards.innerHTML = top
    .map((dept) => `<div class="mini-card"><div class="mini-title">${dept.name}</div><div class="mini-body">Present today: ${presentByDept.get(dept.id) || 0}</div></div>`)
    .join("");
}

async function loadMdEmployees(sb) {
  const tbody = document.getElementById("mdEmployeesBody");
  if (!tbody) return;
  const searchInput = document.getElementById("mdEmployeeSearchInput");
  const deptFilter = document.getElementById("mdEmployeeDepartmentFilter");

  const { data: rows } = await sb
    .from("employees")
    .select("id,work_id,full_name,role,department_id,department:departments(name)")
    .order("full_name");

  const employees = rows || [];
  const departments = [...new Set(employees.map((e) => e.department?.name).filter(Boolean))];
  if (deptFilter) {
    deptFilter.innerHTML = `<option value="">All Departments</option>${departments.map((d) => `<option value="${d}">${d}</option>`).join("")}`;
  }

  const render = () => {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const dept = deptFilter?.value || "";
    const filtered = employees.filter((e) => {
      if (q && !(`${e.full_name} ${e.work_id}`.toLowerCase().includes(q))) return false;
      if (dept && e.department?.name !== dept) return false;
      return true;
    });
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">No matching employees found.</td></tr>`;
      return;
    }
    tbody.innerHTML = filtered
      .map(
        (e) => `<tr>
      <td>${e.work_id || "-"}</td>
      <td>${e.full_name || "-"}</td>
      <td>${e.department?.name || "-"}</td>
      <td>${roleLabel(e.role)}</td>
      <td>Active</td>
    </tr>`,
      )
      .join("");
  };
  render();
  searchInput?.addEventListener("input", render);
  deptFilter?.addEventListener("change", render);
}

async function loadMdLeave(sb, profile) {
  const tbody = document.getElementById("mdLeaveRequestsBody");
  if (!tbody) return;
  const [leavesRes, profilesRes] = await Promise.all([
    sb.from("leaves").select("id,user_id,leave_type,start_date,end_date,status,created_at").order("created_at", { ascending: false }).limit(100),
    sb.from("profiles").select("id,full_name,role"),
  ]);
  const leaves = leavesRes.data || [];
  const profiles = profilesRes.data || [];
  const byId = new Map(profiles.map((p) => [p.id, p]));

  if (!leaves.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No leave requests found.</td></tr>`;
    return;
  }

  tbody.innerHTML = leaves
    .map((l) => {
      const p = byId.get(l.user_id);
      return `<tr>
      <td>${p?.full_name || "-"}</td>
      <td>${p ? roleLabel(p.role) : "-"}</td>
      <td>${l.leave_type || "-"}</td>
      <td>${fmtDate(l.start_date)} - ${fmtDate(l.end_date)}</td>
      <td>${l.status || "-"}</td>
      <td>
        <button class="btn ghost" data-md-leave-action="approved" data-leave-id="${l.id}">Approve</button>
        <button class="btn ghost" data-md-leave-action="rejected" data-leave-id="${l.id}">Reject</button>
      </td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll("button[data-md-leave-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-leave-id");
      const status = btn.getAttribute("data-md-leave-action");
      const { error } = await sb.from("leaves").update({ status, decided_by: profile.id, decided_at: new Date().toISOString() }).eq("id", id);
      if (!error) {
        await logMdActivity(sb, profile, `leave_${status}`, "leave", { leave_id: id });
        loadMdLeave(sb, profile);
      }
    });
  });
}

async function loadMdAttendance(sb) {
  if (!document.getElementById("mdAttPresentAbsentSummary")) return;
  const today = new Date().toISOString().slice(0, 10);
  const [empRes, attRes, deptRes, profRes] = await Promise.all([
    sb.from("employees").select("id"),
    sb.from("attendance").select("user_id,clock_in,clock_out").gte("clock_in", `${today}T00:00:00`).lte("clock_in", `${today}T23:59:59`),
    sb.from("departments").select("id,name").order("name"),
    sb.from("profiles").select("id,department_id"),
  ]);

  const total = (empRes.data || []).length;
  const att = attRes.data || [];
  const presentUsers = new Set(att.map((r) => r.user_id));
  const present = presentUsers.size;
  const absent = Math.max(total - present, 0);
  const late = att.filter((r) => new Date(r.clock_in).getHours() >= 9).length;
  setText("mdAttPresentAbsentSummary", `Present: ${present}, Absent: ${absent}`);
  setText("mdAttLateAbsentSummary", `Late arrivals today: ${late}`);

  const monthCards = document.getElementById("mdMonthlyAttendanceCards");
  if (monthCards) {
    const months = [];
    for (let i = 2; i >= 0; i -= 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      // eslint-disable-next-line no-await-in-loop
      const { count } = await sb.from("attendance").select("id", { head: true, count: "exact" }).gte("clock_in", start).lte("clock_in", end);
      months.push({ label: d.toLocaleString(undefined, { month: "short", year: "numeric" }), count: count || 0 });
    }
    monthCards.innerHTML = months.map((m) => `<div class="mini-card"><div class="mini-title">${m.label}</div><div class="mini-body">Attendance records: ${m.count}</div></div>`).join("");
  }

  const profiles = profRes.data || [];
  const byUserDept = new Map(profiles.map((p) => [p.id, p.department_id]));
  const deptSummary = (deptRes.data || [])
    .map((d) => {
      const p = att.filter((r) => byUserDept.get(r.user_id) === d.id).length;
      return `${d.name}: ${p}`;
    })
    .join(" | ");
  setText("mdDepartmentAttendanceSummary", deptSummary || "No department attendance records today.");
}

async function loadMdPayroll(sb, profile) {
  if (!document.getElementById("mdPayrollTotalCost")) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [payRes, profileRes, deptRes] = await Promise.all([
    sb.from("payroll").select("id,user_id,net_pay,period_start,period_end,created_at").gte("period_start", start).lte("period_end", end),
    sb.from("profiles").select("id,department_id"),
    sb.from("departments").select("id,name"),
  ]);

  const payroll = payRes.data || [];
  const profiles = profileRes.data || [];
  const departments = deptRes.data || [];
  const profileByUser = new Map(profiles.map((p) => [p.id, p]));
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
  const total = payroll.reduce((sum, row) => sum + Number(row.net_pay || 0), 0);
  setText("mdPayrollTotalCost", total.toLocaleString(undefined, { style: "currency", currency: "KES", maximumFractionDigits: 2 }));
  setText("mdPayrollStatus", payroll.length ? "Generated" : "No payroll generated");

  const byDept = new Map();
  payroll.forEach((p) => {
    const deptId = profileByUser.get(p.user_id)?.department_id;
    const key = deptNameById.get(deptId) || "Unassigned";
    byDept.set(key, (byDept.get(key) || 0) + Number(p.net_pay || 0));
  });

  const cards = document.getElementById("mdPayrollByDepartmentCards");
  if (cards) {
    cards.innerHTML = [...byDept.entries()]
      .map(([name, amount]) => `<div class="mini-card"><div class="mini-title">${name}</div><div class="mini-body">${amount.toLocaleString(undefined, { style: "currency", currency: "KES", maximumFractionDigits: 2 })}</div></div>`)
      .join("");
  }

  document.getElementById("mdPayrollDownloadPdfBtn")?.addEventListener("click", async () => {
    setInline("mdPayrollInlineMsg", "Payroll PDF export queued.");
    await logMdActivity(sb, profile, "md_payroll_export_pdf", "payroll", { period_start: start, period_end: end });
  });
  document.getElementById("mdPayrollDownloadCsvBtn")?.addEventListener("click", async () => {
    setInline("mdPayrollInlineMsg", "Payroll CSV export queued.");
    await logMdActivity(sb, profile, "md_payroll_export_csv", "payroll", { period_start: start, period_end: end });
  });
}

async function loadMdReports(sb, profile) {
  if (!document.getElementById("mdReportsExportPdfBtn")) return;
  document.querySelectorAll("button[data-md-report]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const report = btn.getAttribute("data-md-report");
      setInline("mdReportsInlineMsg", `Report request submitted: ${report}`);
      await logMdActivity(sb, profile, "md_report_export", "report", { format: report });
    });
  });
  document.getElementById("mdReportsExportPdfBtn")?.addEventListener("click", async () => {
    setInline("mdReportsInlineMsg", "Consolidated PDF export queued.");
    await logMdActivity(sb, profile, "md_report_export", "report", { format: "consolidated-pdf" });
  });
  document.getElementById("mdReportsExportCsvBtn")?.addEventListener("click", async () => {
    setInline("mdReportsInlineMsg", "Consolidated CSV export queued.");
    await logMdActivity(sb, profile, "md_report_export", "report", { format: "consolidated-csv" });
  });
}

async function loadMdAnnouncements(sb, profile) {
  const list = document.getElementById("mdAnnouncementsList");
  if (!list) return;

  const render = async () => {
    const { data } = await sb
      .from("activity_logs")
      .select("id,action,details,created_at")
      .eq("entity", "announcement")
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = data || [];
    if (!rows.length) {
      list.innerHTML = `<div class="mini-card"><div class="mini-title">No announcements</div><div class="mini-body">Create your first announcement to notify users.</div></div>`;
      return;
    }
    list.innerHTML = rows
      .map((r) => {
        const details = r.details || {};
        return `<div class="mini-card">
          <div class="mini-title">${details.subject || "Announcement"}</div>
          <div class="mini-body">${details.message || "-"}</div>
          <div class="mini-body muted">Recipients: ${details.recipients || "all"} | ${new Date(r.created_at).toLocaleString()}</div>
        </div>`;
      })
      .join("");
  };

  document.getElementById("mdNewAnnouncementBtn")?.addEventListener("click", () => {
    document.getElementById("mdAnnouncementSubject")?.focus();
    setInline("mdAnnouncementInlineMsg", "Fill in subject and message, then post.");
  });

  document.getElementById("mdPostAnnouncementBtn")?.addEventListener("click", async () => {
    const subject = document.getElementById("mdAnnouncementSubject")?.value.trim();
    const message = document.getElementById("mdAnnouncementMessage")?.value.trim();
    const recipients = document.getElementById("mdAnnouncementRecipients")?.value || "all";
    if (!subject || !message) {
      setInline("mdAnnouncementInlineMsg", "Subject and message are required.", true);
      return;
    }
    const { error } = await sb.from("activity_logs").insert({
      actor_user_id: profile.id,
      action: "announcement_posted",
      entity: "announcement",
      details: {
        subject,
        message,
        recipients,
        notify_all: recipients === "all",
      },
    });
    if (error) {
      setInline("mdAnnouncementInlineMsg", error.message || "Failed to post announcement.", true);
      return;
    }
    setInline("mdAnnouncementInlineMsg", "Announcement posted successfully.");
    document.getElementById("mdAnnouncementSubject").value = "";
    document.getElementById("mdAnnouncementMessage").value = "";
    await render();
  });

  await render();
}

async function loadMdProfile(sb, profile) {
  if (!document.getElementById("mdProfileEmail")) return;
  const { data: departments } = await sb.from("departments").select("id,name");
  const deptMap = new Map((departments || []).map((d) => [d.id, d.name]));
  document.getElementById("mdProfileEmail").value = profile.email || "";
  document.getElementById("mdProfileRole").value = roleLabel(profile.role);
  document.getElementById("mdProfileFullName").value = profile.full_name || "";

  const { data: fresh } = await sb
    .from("profiles")
    .select("full_name,phone,address,department_id")
    .eq("id", profile.id)
    .maybeSingle();
  if (fresh) {
    document.getElementById("mdProfileFullName").value = fresh.full_name || "";
    document.getElementById("mdProfilePhone").value = fresh.phone || "";
    document.getElementById("mdProfileAddress").value = fresh.address || deptMap.get(fresh.department_id) || "";
  }

  document.getElementById("mdUpdateProfileBtn")?.addEventListener("click", async () => {
    const full_name = document.getElementById("mdProfileFullName").value.trim();
    const phone = document.getElementById("mdProfilePhone").value.trim();
    const address = document.getElementById("mdProfileAddress").value.trim();
    const { error } = await sb.from("profiles").update({ full_name, phone, address }).eq("id", profile.id);
    if (error) {
      setInline("mdProfileInlineMsg", error.message || "Profile update failed.", true);
      return;
    }
    await logMdActivity(sb, profile, "md_profile_updated", "profile", { full_name, phone });
    setInline("mdProfileInlineMsg", "Profile updated.");
  });

  document.getElementById("mdChangePasswordBtn")?.addEventListener("click", async () => {
    const { error } = await sb.auth.resetPasswordForEmail(profile.email);
    if (error) {
      setInline("mdProfileInlineMsg", error.message || "Password reset request failed.", true);
      return;
    }
    setInline("mdProfileInlineMsg", "Password reset email sent.");
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.manager, Roles.admin]);
  if (!profile) return;
  const sb = window.supabaseClient;
  if (!sb) return;

  wireWelcome(profile);
  await Promise.allSettled([
    loadMdDashboard(sb),
    loadMdDepartments(sb),
    loadMdEmployees(sb),
    loadMdLeave(sb, profile),
    loadMdAttendance(sb),
    loadMdPayroll(sb, profile),
    loadMdReports(sb, profile),
    loadMdAnnouncements(sb, profile),
    loadMdProfile(sb, profile),
  ]);
});
