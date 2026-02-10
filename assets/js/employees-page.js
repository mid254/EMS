document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.admin, Roles.hr, Roles.supervisor, Roles.manager]);
  if (!profile) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} • ${profile.work_id}`;

  const body = document.getElementById("employeesBody");
  body.innerHTML = "";
  const data = DummyDB.USERS;
  for (const e of data ?? []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.profiles?.work_id ?? e.work_id ?? "")}</td>
      <td>${escapeHtml(e.full_name ?? "")}</td>
      <td>${escapeHtml(roleLabel(e.role))}</td>
      <td>${escapeHtml(e.departments?.name ?? "")}</td>
    `;
    body.appendChild(tr);
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

