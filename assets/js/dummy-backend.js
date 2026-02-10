// Simple in-memory / localStorage "backend" for university demo

const DummyDB = (function () {
  const ROLES = {
    admin: "admin",
    hr: "hr",
    manager: "manager",
    supervisor: "supervisor",
    employee: "employee",
  };

  const DEPARTMENTS = [
    { id: "dep-ops", name: "Operations" },
    { id: "dep-acc", name: "Accounts" },
    { id: "dep-sal", name: "Sales & Marketing" },
    { id: "dep-it", name: "IT" },
  ];

  const USERS = [
    {
      id: "u-admin",
      email: "admin@ems.com",
      password: "admin123",
      full_name: "System Administrator",
      role: ROLES.admin,
      department_id: "dep-ops",
      department_name: "Operations",
      work_id: "AD-0001",
    },
    {
      id: "u-hr",
      email: "hr@ems.com",
      password: "hr123",
      full_name: "HR Officer",
      role: ROLES.hr,
      department_id: "dep-ops",
      department_name: "Operations",
      work_id: "HR-0001",
    },
    {
      id: "u-manager",
      email: "manager@ems.com",
      password: "manager123",
      full_name: "Managing Director",
      role: ROLES.manager,
      department_id: "dep-ops",
      department_name: "Operations",
      work_id: "MD-0001",
    },
    {
      id: "u-super-it",
      email: "supervisor.it@ems.com",
      password: "super123",
      full_name: "IT Supervisor",
      role: ROLES.supervisor,
      department_id: "dep-it",
      department_name: "IT",
      work_id: "S-IT-0001",
    },
    {
      id: "u-emp-acc",
      email: "accounts.emp@ems.com",
      password: "emp123",
      full_name: "Accounts Clerk",
      role: ROLES.employee,
      department_id: "dep-acc",
      department_name: "Accounts",
      work_id: "ACC-0001",
    },
    {
      id: "u-emp-sales",
      email: "sales.emp@ems.com",
      password: "emp123",
      full_name: "Sales Representative",
      role: ROLES.employee,
      department_id: "dep-sal",
      department_name: "Sales & Marketing",
      work_id: "SM-0001",
    },
  ];

  const LEAVE_CATEGORIES = [
    { code: "annual", name: "Annual Leave", max_days: 21 },
    { code: "sick", name: "Sick Leave", max_days: 14 },
    { code: "casual", name: "Casual Leave", max_days: 7 },
  ];

  const STORAGE_KEYS = {
    currentUser: "ems_current_user",
    attendance: "ems_attendance",
    leaves: "ems_leaves",
    payslips: "ems_payslips",
  };

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.currentUser);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setCurrentUser(u) {
    if (!u) {
      localStorage.removeItem(STORAGE_KEYS.currentUser);
      return;
    }
    const copy = { ...u };
    delete copy.password;
    localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(copy));
  }

  function login(email, password) {
    const user = USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!user) {
      throw new Error("Invalid email or password for demo accounts.");
    }
    setCurrentUser(user);
    return getCurrentUser();
  }

  function logout() {
    setCurrentUser(null);
  }

  // Attendance
  function clockIn(userId) {
    const list = loadArray(STORAGE_KEYS.attendance);
    const now = new Date();
    const rec = {
      id: "att-" + now.getTime(),
      user_id: userId,
      date: now.toISOString().slice(0, 10),
      clock_in: now.toISOString(),
      clock_out: null,
    };
    list.push(rec);
    saveArray(STORAGE_KEYS.attendance, list);
    return rec;
  }

  function clockOut(userId) {
    const list = loadArray(STORAGE_KEYS.attendance);
    const open = [...list]
      .reverse()
      .find((r) => r.user_id === userId && !r.clock_out);
    if (!open) {
      throw new Error("No open clock-in record found.");
    }
    open.clock_out = new Date().toISOString();
    saveArray(STORAGE_KEYS.attendance, list);
    return open;
  }

  function listAttendanceForUser(userId) {
    return loadArray(STORAGE_KEYS.attendance).filter((r) => r.user_id === userId);
  }

  function listAllAttendance() {
    return loadArray(STORAGE_KEYS.attendance);
  }

  // Seed dummy payslips and leaves only once
  (function seed() {
    if (!loadArray(STORAGE_KEYS.payslips).length) {
      const nowYear = new Date().getFullYear();
      const payslips = USERS.map((u, idx) => ({
        id: "pay-" + idx,
        user_id: u.id,
        period_start: `${nowYear}-01-01`,
        period_end: `${nowYear}-01-31`,
        basic_salary: 50000 + idx * 5000,
        allowances: 5000,
        deductions: 2000,
      }));
      saveArray(STORAGE_KEYS.payslips, payslips);
    }

    if (!loadArray(STORAGE_KEYS.leaves).length) {
      const leaves = [
        {
          id: "lv-1",
          user_id: "u-emp-acc",
          category: "annual",
          days: 5,
          status: "approved",
        },
        {
          id: "lv-2",
          user_id: "u-emp-sales",
          category: "sick",
          days: 2,
          status: "pending",
        },
      ];
      saveArray(STORAGE_KEYS.leaves, leaves);
    }
  })();

  function listPayslipsForUser(userId) {
    return loadArray(STORAGE_KEYS.payslips).filter((p) => p.user_id === userId);
  }

  function listLeavesForUser(userId) {
    return loadArray(STORAGE_KEYS.leaves).filter((l) => l.user_id === userId);
  }

  function listLeavesAll() {
    return loadArray(STORAGE_KEYS.leaves);
  }

  return {
    ROLES,
    DEPARTMENTS,
    USERS,
    LEAVE_CATEGORIES,
    login,
    logout,
    getCurrentUser,
    clockIn,
    clockOut,
    listAttendanceForUser,
    listAllAttendance,
    listPayslipsForUser,
    listLeavesForUser,
    listLeavesAll,
  };
})();

