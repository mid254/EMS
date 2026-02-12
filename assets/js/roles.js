const Roles = DummyDB.ROLES;

function roleLabel(role) {
  switch (role) {
    case Roles.admin:
      return "Admin";
    case Roles.hr:
      return "HR";
    case Roles.manager:
      return "Managing Director";
    case Roles.supervisor:
      return "Supervisor";
    case Roles.employee:
      return "Employee";
    default:
      return role;
  }
}

function rolePrefix(role) {
  // Used only for UI display; the database generates the Work ID.
  switch (role) {
    case Roles.admin:
      return "ADM";
    case Roles.hr:
      return "HR";
    case Roles.manager:
      return "MGR";
    case Roles.supervisor:
      return "SUP";
    case Roles.employee:
      return "EMP";
    default:
      return "EMP";
  }
}

async function requireRole(allowedRoles) {
  const profile = await loadMyProfile();
  if (!profile) return null;
  if (!allowedRoles.includes(profile.role)) {
    // send user to their own dashboard
    window.location.href = "../" + (function () {
      switch (profile.role) {
        case Roles.admin:
          return "dashboards/admin.html";
        case Roles.hr:
          return "dashboards/hr.html";
        case Roles.manager:
          return "dashboards/managers.html";
        case Roles.supervisor:
          return "dashboards/supervisor.html";
        default:
          return "dashboards/employee.html";
      }
    })();
    return null;
  }
  return profile;
}

