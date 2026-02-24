document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const workIdInput = document.getElementById("workId");
  const loginError = document.getElementById("loginError");

  if (!loginForm || !emailInput || !passwordInput || !workIdInput || !loginError) {
    console.error("Login form elements not found in DOM.");
    return;
  }

  if (!window.supabaseClient) {
    loginError.textContent =
      "Supabase is not configured. Add URL and anon key in assets/js/supabase-client.js";
    loginError.style.display = "block";
    return;
  }

  const supabase = window.supabaseClient;

  const roleRedirectMap = {
    admin: "/dashboards/admin/dashboard.html",
    md: "/dashboards/managers/dashboard.html",
    hr: "/dashboards/hr/dashboard.html",
    supervisor: "/dashboards/supervisor/dashboard.html",
    employee: "/dashboards/employee/dashboard.html",
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const enteredWorkId = workIdInput.value.trim();

    if (!email || !password || !enteredWorkId) {
      showError("Please fill in all fields.");
      return;
    }

    const submitButton =
      loginForm.querySelector('button[type="submit"]') ||
      loginForm.querySelector('input[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error("Auth error:", authError);
        showError("Invalid email or password.");
        return;
      }

      const user = authData && authData.user;
      if (!user || !user.id) {
        console.error("No user returned after login.");
        showError("Unable to log in. Please try again.");
        return;
      }

      const authUserId = user.id;

      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .select("auth_user_id, role, work_id")
        .eq("auth_user_id", authUserId)
        .single();

      if (employeeError) {
        console.error("Employee fetch error:", employeeError);
        if (
          employeeError.code === "PGRST116" ||
          (employeeError.details && employeeError.details.includes("Results contain 0 rows"))
        ) {
          showError("No employee profile found for this account.");
        } else {
          showError("There was a problem loading your profile. Please try again later.");
        }
        await safeSignOut(supabase);
        return;
      }

      if (!employee) {
        console.error("Employee record is null or undefined.");
        showError("No employee profile found for this account.");
        await safeSignOut(supabase);
        return;
      }

      const employeeWorkId = (employee.work_id == null ? "" : String(employee.work_id)).trim();
      const normalizedEnteredWorkId = String(enteredWorkId).trim();

      if (!employeeWorkId || employeeWorkId !== normalizedEnteredWorkId) {
        console.warn("Work ID mismatch:", {
          enteredWorkId: normalizedEnteredWorkId,
          employeeWorkId,
        });
        showError("Invalid Work ID.");
        await safeSignOut(supabase);
        return;
      }

      const role = (employee.role == null ? "" : String(employee.role)).trim().toLowerCase();
      const redirectUrl = roleRedirectMap[role];

      if (!redirectUrl) {
        console.error("Unknown or unsupported role:", role);
        showError("Your account role is not authorized to access this system.");
        await safeSignOut(supabase);
        return;
      }

      window.location.href = redirectUrl;
    } catch (err) {
      console.error("Unexpected login error:", err);
      showError("A network or server error occurred. Please try again.");
      await safeSignOut(supabase);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  function showError(message) {
    loginError.textContent = message;
    loginError.style.display = "block";
  }

  function clearError() {
    loginError.textContent = "";
    loginError.style.display = "none";
  }
});

async function safeSignOut(supabase) {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Error during sign-out:", err);
  }
}

