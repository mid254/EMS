document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.supervisor, Roles.admin]);
  if (!profile) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} - ${profile.work_id || profile.email}`;

  const nameEls = document.querySelectorAll("#supervisorName, #topbarName, .topbar-profile-name, .sidebar-profile-name");
  nameEls.forEach((el) => (el.textContent = profile.full_name || "Supervisor"));

  if (document.getElementById("deptEmployeesBody")) {
    const body = document.getElementById("deptEmployeesBody");
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

  if (!document.getElementById("supDeptEmployees")) return;
  const sb = window.supabaseClient;
  if (!sb) return;
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
