document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.admin]);
  if (!profile) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} • ${profile.work_id}`;

  // Fill role + department selects
  const roleSelect = document.getElementById("empRole");
  const deptSelect = document.getElementById("empDepartment");
  const msgEl = document.getElementById("addEmployeeMsg");

  const roles = [Roles.hr, Roles.manager, Roles.supervisor, Roles.employee, Roles.admin];
  roleSelect.innerHTML = "";
  for (const r of roles) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = roleLabel(r);
    roleSelect.appendChild(opt);
  }

  const departments = Departments.listDepartments();
  Departments.fillSelect(deptSelect, departments);

  // Recent employees table
  async function refreshRecent() {
    const rows = await Employees.listRecentEmployees(12);
    const body = document.getElementById("recentEmployeesBody");
    body.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const workId = r.work_id ?? "";
      const deptName = r.department_name ?? "";
      tr.innerHTML = `
        <td>${escapeHtml(workId)}</td>
        <td>${escapeHtml(r.full_name ?? "")}</td>
        <td>${escapeHtml(roleLabel(r.role))}</td>
        <td>${escapeHtml(deptName)}</td>
        <td>${escapeHtml(new Date(r.created_at).toLocaleString())}</td>
      `;
      body.appendChild(tr);
    }
  }

  await refreshRecent();

  // Create employee record
  document.getElementById("addEmployeeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.textContent = "";
    const full_name = document.getElementById("empFullName").value.trim();
    const email = document.getElementById("empEmail").value.trim();
    const role = roleSelect.value;
    const department_id = deptSelect.value;

    try {
      await Employees.createEmployee({ full_name, email, role, department_id });
      msgEl.textContent = "Employee record created. Work ID auto-generated.";
      e.target.reset();
      Departments.fillSelect(deptSelect, departments); // reset clears select; refill
      await refreshRecent();
    } catch (err) {
      msgEl.textContent = err?.message || "Failed to create employee";
    }
  });
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

