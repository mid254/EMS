const Employees = (function () {
  function getClient() {
    const sb = window.supabaseClient;
    if (!sb) {
      throw new Error("Supabase client not configured. Check supabase-client.js.");
    }
    return sb;
  }

  async function countEmployees() {
    const sb = getClient();
    const { count, error } = await sb
      .from("employees")
      .select("*", { head: true, count: "exact" });
    if (error) throw error;
    return count || 0;
  }

  async function listRecentEmployees(limit = 12) {
    const sb = getClient();
    const { data, error } = await sb
      .from("employees")
      .select("id, work_id, email, full_name, role, department_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function listAllEmployees() {
    const sb = getClient();
    const { data, error } = await sb
      .from("employees")
      .select("id, work_id, email, full_name, role, department_id, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createEmployee({ full_name, email, role, department_id }) {
    const sb = getClient();
    const clean = {
      full_name: (full_name || "").trim(),
      email: (email || "").trim(),
      role: (role || "employee").trim().toLowerCase(),
      department_id,
    };

    if (!clean.full_name || !clean.email) {
      throw new Error("Full name and email are required.");
    }
    if (!clean.department_id) {
      throw new Error("Department is required.");
    }

    const { data, error } = await sb
      .from("employees")
      .insert([clean])
      .select("id, work_id, email, full_name, role, department_id, created_at")
      .single();
    if (error) throw error;
    return data;
  }

  return {
    countEmployees,
    listRecentEmployees,
    listAllEmployees,
    createEmployee,
  };
})();

document.addEventListener("DOMContentLoaded", async () => {
  // Only run the Employees page wiring when we're on the admin Employees screen.
  if (!window.location.pathname.includes("/dashboards/admin/employees.html")) return;

  const profile = await requireRole([Roles.admin]);
  if (!profile) return;

  const tbody = document.getElementById("adminEmployeesBody");
  if (!tbody) return;

  async function renderEmployees() {
    try {
      const rows = await Employees.listAllEmployees();
      tbody.innerHTML = "";
      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td colspan="6" class="muted" style="text-align:center;padding:18px">No employees to display yet.</td>';
        tbody.appendChild(tr);
        return;
      }

      for (const emp of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${emp.work_id || "—"}</td>
          <td>${emp.full_name || "—"}</td>
          <td>${emp.department_id || "—"}</td>
          <td>${roleLabel(emp.role)}</td>
          <td>Active</td>
          <td><span class="muted">View / Edit (to be implemented)</span></td>
        `;
        tbody.appendChild(tr);
      }
    } catch (err) {
      console.error("Failed to load employees:", err);
      tbody.innerHTML =
        '<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">Failed to load employees.</td></tr>';
    }
  }

  await renderEmployees();

  const addBtn = document.querySelector(".card-header-row .btn.primary");
  if (!addBtn) return;

  addBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    try {
      const full_name = (prompt("Enter employee full name:", "") || "").trim();
      if (!full_name) return;

      const email = (prompt("Enter employee email address:", "") || "").trim();
      if (!email) return;

      const roleInput = (prompt(
        'Enter role (admin, md, hr, supervisor, employee):',
        "employee"
      ) || "employee").trim().toLowerCase();

      const validRoles = ["admin", "md", "hr", "supervisor", "employee"];
      const role = validRoles.includes(roleInput) ? roleInput : "employee";

      const deptName =
        (prompt("Enter department name (e.g. IT, HR, Accounts):", "IT") || "IT").trim();

      const department = await Departments.getOrCreateDepartmentByName(deptName);

      await Employees.createEmployee({
        full_name,
        email,
        role,
        department_id: department.id,
      });

      await renderEmployees();
      alert("Employee created successfully. The Work ID is auto-generated and now visible in the list.");
    } catch (err) {
      console.error("Error creating employee:", err);
      alert(err?.message || "Failed to create employee.");
    }
  });
});
