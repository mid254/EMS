document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("requestResetForm");
  const emailInput = document.getElementById("resetEmail");
  const messageEl = document.getElementById("resetMessage");

  if (!form || !emailInput || !messageEl) return;

  if (!window.supabaseClient) {
    messageEl.textContent =
      "Supabase is not configured. Please contact the system administrator.";
    return;
  }

  const supabase = window.supabaseClient;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageEl.textContent = "";

    const email = emailInput.value.trim();
    if (!email) {
      messageEl.textContent = "Please enter your email.";
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/password.html`,
      });

      if (error) {
        console.error("Reset error:", error);
        messageEl.textContent = "Unable to send reset link. Please check the email and try again.";
        return;
      }

      messageEl.textContent =
        "If this email is registered, a password reset link has been sent.";
    } catch (err) {
      console.error("Unexpected reset error:", err);
      messageEl.textContent = "A network error occurred. Please try again.";
    }
  });
});

