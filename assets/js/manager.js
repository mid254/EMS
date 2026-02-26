document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.manager, Roles.admin]);
  if (!profile) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} - ${profile.work_id}`;

  if (!document.getElementById("mdTotalEmployees")) return;
  const sb = window.supabaseClient;
  if (!sb) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

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
  if (cards) {
    cards.innerHTML = `
      <div class="mini-card"><div class="mini-title">Company Performance</div><div class="mini-body">Attendance compliance at ${compliance}%. ${pendingApprovals || 0} high-level approval item(s) pending.</div></div>
      <div class="mini-card"><div class="mini-title">Department Health</div><div class="mini-body">${totalDepartments || 0} active department(s), ${onLeaveToday || 0} employee(s) on leave today.</div></div>
    `;
  }
});
