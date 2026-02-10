document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.employee, Roles.admin, Roles.hr, Roles.manager, Roles.supervisor]);
  if (!profile) return;
  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} • ${profile.work_id}`;
});

