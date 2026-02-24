const Roles = {
  admin: "admin",
  hr: "hr",
  // Managing Director in the database uses the "md" role;
  // expose it as both md and manager for convenience.
  md: "md",
  manager: "md",
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
    case Roles.md:
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
  try {
    const sb = window.supabaseClient;
    if (!sb || !sb.auth) {
      console.error("Supabase client not available in requireRole.");
      window.location.href = "/index.html";
      return null;
    }

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Unable to load current auth user:", userError);
      window.location.href = "/index.html";
      return null;
    }

    const user = userData.user;

    // Load profile from public.profiles (preferred)
    let profile = null;
    const { data: profileRow, error: profileError } = await sb
      .from("profiles")
      .select("id, email, full_name, role, department_id, work_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Error loading profile:", profileError);
    }

    if (profileRow) {
      profile = {
        id: profileRow.id,
        email: profileRow.email || user.email,
        full_name: profileRow.full_name || user.email,
        role: profileRow.role,
        department_id: profileRow.department_id,
        work_id: profileRow.work_id,
      };
    } else {
      // Fallback: derive a minimal profile from auth user if profiles table is empty.
      profile = {
        id: user.id,
        email: user.email,
        full_name:
          (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
          user.email,
        role: "employee",
        department_id: null,
        work_id: null,
      };
    }

    const role = String(profile.role || "").toLowerCase();
    const allowed = (allowedRoles || []).map((r) => String(r || "").toLowerCase());

    if (allowed.length && !allowed.includes(role)) {
      console.warn("Access denied for role", role, "allowed:", allowed);
      window.location.href = "/index.html";
      return null;
    }

    return profile;
  } catch (err) {
    console.error("Unexpected error in requireRole:", err);
    window.location.href = "/index.html";
    return null;
  }
}

