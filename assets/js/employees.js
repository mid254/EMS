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
      .select("*, departments(name)")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createEmployee({ full_name, email, phone, role, department_id }) {
    const sb = getClient();
    const clean = {
      full_name: (full_name || "").trim(),
      email: (email || "").trim(),
      role: (role || "employee").trim().toLowerCase(),
      phone: (phone || "").trim() || null,
      department_id,
    };

    if (!clean.full_name || !clean.email) {
      throw new Error("Full name and email are required.");
    }
    if (!clean.department_id) {
      throw new Error("Department is required.");
    }

    const { data, error } = await sb.from("employees").insert([clean]).select("*, departments(name)").single();
    if (error) throw error;
    return data;
  }

  async function updateEmployee(id, { full_name, email, phone, role, department_id }) {
    const sb = getClient();
    const clean = {
      full_name: (full_name || "").trim(),
      email: (email || "").trim(),
      role: (role || "employee").trim().toLowerCase(),
      phone: (phone || "").trim() || null,
      department_id,
    };

    const { data, error } = await sb
      .from("employees")
      .update(clean)
      .eq("id", id)
      .select("*, departments(name)")
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteEmployee(id) {
    const sb = getClient();
    const { error } = await sb.from("employees").delete().eq("id", id);
    if (error) throw error;
  }

  return {
    countEmployees,
    listRecentEmployees,
    listAllEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
  };
})();

document.addEventListener("DOMContentLoaded", async () => {
  // Only run the Employees page wiring when we're on the admin Employees screen.
  if (!window.location.pathname.includes("/dashboards/admin/employees.html")) return;

  const profile = await requireRole([Roles.admin]);
  if (!profile) return;

  const tbody = document.getElementById("adminEmployeesBody");
  if (!tbody) return;

  const filterDepartment = document.getElementById("filterDepartment");
  const filterRole = document.getElementById("filterRole");
  const summaryEl = document.getElementById("employeesSummary");
  const deptStatsEl = document.getElementById("departmentStats");
  const openFormBtn = document.getElementById("openEmployeeFormBtn");
  const formCard = document.getElementById("employeeFormCard");
  const form = document.getElementById("employeeForm");
  const formTitle = document.getElementById("employeeFormTitle");
  const formSubtitle = document.getElementById("employeeFormSubtitle");
  const formError = document.getElementById("employeeFormError");
  const cancelFormBtn = document.getElementById("cancelEmployeeForm");
  const fullNameInput = document.getElementById("empFullName");
  const emailInput = document.getElementById("empEmail");
  const phoneInput = document.getElementById("empPhone");
  const deptSelect = document.getElementById("empDepartment");
  const roleSelect = document.getElementById("empRole");

  let allEmployees = [];
  let editingEmployeeId = null;
  let departmentsCache = [];

  async function loadDepartmentsAndRoles() {
    try {
      departmentsCache = await Departments.listDepartments();
      Departments.fillSelect(filterDepartment, [{ id: "", name: "All departments" }, ...departmentsCache]);
      Departments.fillSelect(deptSelect, departmentsCache);
    } catch (err) {
      console.error("Failed to load departments:", err);
    }

    if (roleSelect) {
      roleSelect.innerHTML = "";
      const roles = [Roles.admin, Roles.md, Roles.hr, Roles.supervisor, Roles.employee];
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "Select role";
      roleSelect.appendChild(defaultOpt);
      for (const r of roles) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = roleLabel(r);
        roleSelect.appendChild(opt);
      }
    }

    if (filterRole) {
      filterRole.innerHTML = "";
      const anyOpt = document.createElement("option");
      anyOpt.value = "";
      anyOpt.textContent = "All roles";
      filterRole.appendChild(anyOpt);
      const roles = [Roles.admin, Roles.md, Roles.hr, Roles.supervisor, Roles.employee];
      for (const r of roles) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = roleLabel(r);
        filterRole.appendChild(opt);
      }
    }
  }

  function getFilteredEmployees() {
    const deptId = filterDepartment?.value || "";
    const roleVal = filterRole?.value || "";
    return allEmployees.filter((emp) => {
      const matchDept = !deptId || emp.department_id === deptId;
      const matchRole = !roleVal || String(emp.role).toLowerCase() === String(roleVal).toLowerCase();
      return matchDept && matchRole;
    });
  }

  function renderSummaryAndStats(rows) {
    if (summaryEl) {
      summaryEl.textContent = `Total employees: ${rows.length}`;
    }
    if (!deptStatsEl) return;
    const counts = new Map();
    for (const emp of rows) {
      const deptId = emp.department_id || "none";
      const deptName =
        (emp.departments && emp.departments.name) ||
        (departmentsCache.find((d) => d.id === emp.department_id)?.name || "Unassigned");
      const current = counts.get(deptId) || { name: deptName, count: 0 };
      current.count += 1;
      counts.set(deptId, current);
    }
    deptStatsEl.innerHTML = "";
    if (!counts.size) return;
    for (const [, info] of counts.entries()) {
      const card = document.createElement("div");
      card.className = "mini-card";
      card.style.minWidth = "160px";
      card.innerHTML = `
        <div class="mini-title">${info.name}</div>
        <div class="mini-body">${info.count} employee${info.count === 1 ? "" : "s"}</div>
      `;
      deptStatsEl.appendChild(card);
    }
  }

  function renderTable(rows) {
    tbody.innerHTML = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="8" class="muted" style="text-align:center;padding:18px">No employees to display yet.</td>';
      tbody.appendChild(tr);
      return;
    }

    for (const emp of rows) {
      const deptName =
        (emp.departments && emp.departments.name) ||
        (departmentsCache.find((d) => d.id === emp.department_id)?.name || "Unassigned");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${emp.full_name || "—"}</td>
        <td>${emp.email || "—"}</td>
        <td>${emp.phone || "—"}</td>
        <td>${emp.work_id || "—"}</td>
        <td>${deptName}</td>
        <td>${roleLabel(emp.role)}</td>
        <td>Active</td>
        <td>
          <button class="btn ghost" type="button" data-action="edit" data-id="${emp.id}">Edit</button>
          <button class="btn ghost" type="button" data-action="delete" data-id="${emp.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  async function refreshEmployees() {
    try {
      allEmployees = await Employees.listAllEmployees();
      const filtered = getFilteredEmployees();
      renderTable(filtered);
      renderSummaryAndStats(allEmployees);
    } catch (err) {
      console.error("Failed to load employees:", err);
      tbody.innerHTML =
        '<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">Failed to load employees.</td></tr>';
    }
  }

  function openFormForCreate() {
    editingEmployeeId = null;
    formTitle.textContent = "Add Employee";
    formSubtitle.textContent = "Fill in the details below to add a new employee.";
    formError.textContent = "";
    form.reset();
    if (formCard) formCard.style.display = "block";
  }

  function openFormForEdit(emp) {
    editingEmployeeId = emp.id;
    formTitle.textContent = "Edit Employee";
    formSubtitle.textContent = "Update the details below and save to apply changes.";
    formError.textContent = "";
    fullNameInput.value = emp.full_name || "";
    emailInput.value = emp.email || "";
    phoneInput.value = emp.phone || "";
    if (deptSelect) deptSelect.value = emp.department_id || "";
    if (roleSelect) roleSelect.value = emp.role || "";
    if (formCard) formCard.style.display = "block";
  }

  function closeForm() {
    editingEmployeeId = null;
    formError.textContent = "";
    if (formCard) formCard.style.display = "none";
  }

  await loadDepartmentsAndRoles();
  await refreshEmployees();

  if (filterDepartment) {
    filterDepartment.addEventListener("change", () => {
      const filtered = getFilteredEmployees();
      renderTable(filtered);
      renderSummaryAndStats(allEmployees);
    });
  }

  if (filterRole) {
    filterRole.addEventListener("change", () => {
      const filtered = getFilteredEmployees();
      renderTable(filtered);
      renderSummaryAndStats(allEmployees);
    });
  }

  if (openFormBtn) {
    openFormBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openFormForCreate();
    });
  }

  if (cancelFormBtn) {
    cancelFormBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeForm();
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      formError.textContent = "";
      try {
        const values = {
          full_name: fullNameInput.value,
          email: emailInput.value,
          phone: phoneInput.value,
          role: roleSelect.value,
          department_id: deptSelect.value,
        };
        if (!values.full_name || !values.email || !values.role || !values.department_id) {
          formError.textContent = "Please fill in all required fields.";
          return;
        }

        if (editingEmployeeId) {
          await Employees.updateEmployee(editingEmployeeId, values);
        } else {
          await Employees.createEmployee(values);
        }

        closeForm();
        await refreshEmployees();
      } catch (err) {
        console.error("Failed to save employee:", err);
        formError.textContent = err?.message || "Failed to save employee.";
      }
    });
  }

  tbody.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id) return;

    const emp = allEmployees.find((x) => x.id === id);
    if (action === "edit") {
      if (!emp) return;
      openFormForEdit(emp);
    } else if (action === "delete") {
      if (!emp) return;
      if (!confirm("Are you sure you want to delete this employee record?")) return;
      try {
        await Employees.deleteEmployee(id);
        await refreshEmployees();
      } catch (err) {
        console.error("Failed to delete employee:", err);
        alert(err?.message || "Failed to delete employee.");
      }
    }
  });
});
