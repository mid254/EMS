function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

async function onLogoutClick(e) {
  e.preventDefault();
  try {
    if (window.supabaseClient && window.supabaseClient.auth) {
      await window.supabaseClient.auth.signOut();
    }
  } catch (err) {
    console.error("Error during Supabase sign-out:", err);
  } finally {
    window.location.href = "/index.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", onLogoutClick);
});

