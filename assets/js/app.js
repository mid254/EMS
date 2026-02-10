async function loadMyProfile() {
  const user = DummyDB.getCurrentUser();
  if (!user) {
    window.location.href = "../index.html";
    return null;
  }
  return user;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

async function onLogoutClick(e) {
  e.preventDefault();
  DummyDB.logout();
  window.location.href = "../index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", onLogoutClick);
});

