document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.supervisor, Roles.admin]);
  if (!profile) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} • ${profile.department_name}`;

  const body = document.getElementById("deptEmployeesBody");
  async function refresh() {
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
  await refresh();
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

