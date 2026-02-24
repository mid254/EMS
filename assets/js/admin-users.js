document.addEventListener("DOMContentLoaded", async () => {
  if (!window.location.pathname.includes("/dashboards/admin/users.html")) return;

  const profile = await requireRole([Roles.admin]);
  if (!profile) return;

  const tbody = document.getElementById("systemUsersBody");
  if (!tbody) return;

  async function renderSystemUsers() {
    const sb = window.supabaseClient;
    if (!sb) {
      console.warn("Supabase client not available; cannot load system users.");
      return;
    }

    try {
      const { data, error } = await sb
        .from("employees")
        .select("id, email, full_name, role, auth_user_id, work_id, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows = data || [];
      tbody.innerHTML = "";
      if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td colspan="5" class="muted" style="text-align:center;padding:18px">No system users to display yet.</td>';
        tbody.appendChild(tr);
        return;
      }

      for (const u of rows) {
        const lastLogin = u.created_at ? new Date(u.created_at).toLocaleString() : "—";
        const status = u.auth_user_id ? "Active" : "Pending account";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${u.email || "—"}</td>
          <td>${roleLabel(u.role)}</td>
          <td>${lastLogin}</td>
          <td>${status}</td>
          <td><span class="muted">Reset / Disable (to be implemented)</span></td>
        `;
        tbody.appendChild(tr);
      }
    } catch (err) {
      console.error("Failed to load system users:", err);
      tbody.innerHTML =
        '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Failed to load system users.</td></tr>';
    }
  }

  await renderSystemUsers();

  const createBtn = document.querySelector(".card-header-row .btn.primary");
  if (!createBtn) return;

  createBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    try {
      const full_name = (prompt("Enter user full name:", "") || "").trim();
      if (!full_name) return;

      const email = (prompt("Enter user email address (used for login):", "") || "").trim();
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

      await renderSystemUsers();
      alert(
        "System user record created. Next, create or invite the auth account in Supabase so they can sign in."
      );
    } catch (err) {
      console.error("Error creating system user:", err);
      alert(err?.message || "Failed to create system user.");
    }
  });
});

