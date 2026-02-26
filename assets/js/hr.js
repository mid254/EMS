document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.hr, Roles.admin]);
  if (!profile) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} - ${profile.work_id}`;

  if (!document.getElementById("hrTotalEmployees")) return;
  const sb = window.supabaseClient;
  if (!sb) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const today = now.toISOString().slice(0, 10);

  const [{ count: totalEmployees }, { count: newThisMonth }, { count: onLeaveToday }, { count: pendingLeaves }] =
    await Promise.all([
      sb.from("employees").select("id", { head: true, count: "exact" }),
      sb.from("employees").select("id", { head: true, count: "exact" }).gte("created_at", monthStart).lte("created_at", monthEnd),
      sb.from("leaves").select("id", { head: true, count: "exact" }).lte("start_date", today).gte("end_date", today).eq("status", "approved"),
      sb.from("leaves").select("id", { head: true, count: "exact" }).eq("status", "pending"),
    ]);

  const { data: attRows } = await sb
    .from("attendance")
    .select("clock_in, clock_out")
    .gte("clock_in", `${today}T00:00:00`)
    .lte("clock_in", `${today}T23:59:59`);

  const issues = (attRows || []).filter((r) => {
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
      <div class="mini-card"><div class="mini-title">Recent Activity</div><div class="mini-body">${newThisMonth || 0} new employee(s) this month. ${pendingLeaves || 0} leave request(s) pending.</div></div>
      <div class="mini-card"><div class="mini-title">Attendance Alerts</div><div class="mini-body">${issues || 0} attendance issue record(s) today.</div></div>
    `;
  }
});
