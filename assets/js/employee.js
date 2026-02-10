document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.employee, Roles.admin, Roles.hr, Roles.manager, Roles.supervisor]);
  if (!profile) return;
  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} • ${profile.work_id}`;

  const msg = document.getElementById("attMsg");
  const clockInBtn = document.getElementById("clockInBtn");
  const clockOutBtn = document.getElementById("clockOutBtn");
  if (!clockInBtn || !clockOutBtn) return;

  clockInBtn.addEventListener("click", async () => {
    msg.textContent = "";
    try {
      await Attendance.clockIn();
      msg.textContent = "Clocked in.";
    } catch (err) {
      msg.textContent = err?.message || "Clock in failed";
    }
  });

  clockOutBtn.addEventListener("click", async () => {
    msg.textContent = "";
    try {
      await Attendance.clockOut();
      msg.textContent = "Clocked out.";
    } catch (err) {
      msg.textContent = err?.message || "Clock out failed";
    }
  });
});

