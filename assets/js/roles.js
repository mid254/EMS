const Roles = {
  admin: "admin",
  hr: "hr",
  md: "md",
  supervisor: "supervisor",
  employee: "employee",
};

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
  // Placeholder: once Supabase-based profile loading is added,
  // this can enforce role-based access. For now, allow access.
  return null;
}

