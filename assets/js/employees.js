const Employees = (function () {
  // In dummy mode we treat DummyDB.USERS as employees list.

  function createEmployee({ full_name, email, role, department_id }) {
    const dept = DummyDB.DEPARTMENTS.find((d) => d.id === department_id);
    const prefixByRole = {
      admin: "AD",
      hr: "HR",
      manager: "MD",
      supervisor: dept ? `S-${dept.name.replace(/\s+/g, "")}` : "S",
      employee:
        dept && dept.name === "Accounts"
          ? "ACC"
          : dept && dept.name === "Sales & Marketing"
          ? "SM"
          : "EMP",
    };
    const prefix = prefixByRole[role] || "EMP";
    const seq = String(DummyDB.USERS.length + 1).padStart(4, "0");
    const work_id = `${prefix}-${seq}`;

    const user = {
      id: "u-" + Date.now(),
      email,
      password: "demo123",
      full_name,
      role,
      department_id,
      department_name: dept ? dept.name : "",
      work_id,
    };
    DummyDB.USERS.push(user);
    return user;
  }

  function listRecentEmployees(limit = 10) {
    return [...DummyDB.USERS]
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .slice(0, limit);
  }

  function listEmployeesInMyDepartment(myDepartmentId) {
    return DummyDB.USERS.filter((u) => u.department_id === myDepartmentId);
  }

  return {
    createEmployee,
    listRecentEmployees,
    listEmployeesInMyDepartment,
  };
})();

