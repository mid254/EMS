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

function wireNotificationButtons() {
  const notifButtons = document.querySelectorAll('button.icon-button[aria-label="Notifications"]');
  notifButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.location.pathname.includes("/dashboards/employee/")) {
        window.location.href = "/dashboards/employee/notifications.html";
      }
    });
  });
}

function wireMobileSidebar() {
  const app = document.querySelector(".app");
  const sidebar = document.querySelector(".sidebar");
  const topbar = document.querySelector(".topbar");
  if (!app || !sidebar || !topbar) return;

  let backdrop = document.querySelector(".mobile-sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "mobile-sidebar-backdrop";
    document.body.appendChild(backdrop);
  }

  let menuBtn = topbar.querySelector(".mobile-menu-btn");
  if (!menuBtn) {
    menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "mobile-menu-btn";
    menuBtn.setAttribute("aria-label", "Open menu");
    menuBtn.textContent = "MENU";
    const actions = topbar.querySelector(".topbar-actions");
    if (actions) {
      topbar.insertBefore(menuBtn, actions);
    } else {
      topbar.appendChild(menuBtn);
    }
  }

  let closeBtn = sidebar.querySelector(".mobile-close-btn");
  if (!closeBtn) {
    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mobile-close-btn";
    closeBtn.setAttribute("aria-label", "Close menu");
    closeBtn.textContent = "CLOSE";
    sidebar.insertBefore(closeBtn, sidebar.firstChild);
  }

  const openSidebar = () => document.body.classList.add("mobile-sidebar-open");
  const closeSidebar = () => document.body.classList.remove("mobile-sidebar-open");
  const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

  menuBtn.addEventListener("click", () => {
    if (!isMobile()) return;
    openSidebar();
  });
  closeBtn.addEventListener("click", closeSidebar);
  backdrop.addEventListener("click", closeSidebar);

  sidebar.querySelectorAll(".nav a").forEach((link) => {
    link.addEventListener("click", () => {
      if (isMobile()) closeSidebar();
    });
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) closeSidebar();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", onLogoutClick);

  wireNotificationButtons();
  wireMobileSidebar();
});
