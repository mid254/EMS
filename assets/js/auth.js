function roleToDashboardPath(role) {
  switch (role) {
    case "admin":
      return "dashboards/admin.html";
    case "hr":
      return "dashboards/hr.html";
    case "manager":
      return "dashboards/manager.html";
    case "supervisor":
      return "dashboards/supervisor.html";
    case "employee":
      return "dashboards/employee.html";
    default:
      return "dashboards/employee.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const existing = DummyDB.getCurrentUser();
  if (existing) {
    window.location.href = roleToDashboardPath(existing.role);
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const errorEl = document.getElementById("loginError");
    errorEl.textContent = "";
    try {
      const user = DummyDB.login(email, password);
      window.location.href = roleToDashboardPath(user.role);
    } catch (err) {
      errorEl.textContent = err?.message || "Login failed";
    }
  });
});

