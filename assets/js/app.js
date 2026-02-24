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

function createInlineNotice(container) {
  const existing = container.querySelector(".demo-inline-notice");
  if (existing) return existing;
  const notice = document.createElement("div");
  notice.className = "demo-inline-notice";
  notice.style.marginTop = "8px";
  notice.style.fontSize = "0.85rem";
  notice.style.color = "var(--muted, #6b7280)";
  container.appendChild(notice);
  return notice;
}

function showDemoMessage(target, message) {
  const card = target.closest(".card") || target.closest(".content") || document.body;
  const notice = createInlineNotice(card);
  notice.textContent = message;
}

function wireExportButtons() {
  const exportButtons = document.querySelectorAll(".download-actions button, .download-actions .btn");
  exportButtons.forEach((btn) => {
    if (btn.dataset.wiredDemo === "1") return;
    btn.dataset.wiredDemo = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const label = (btn.textContent || "").trim().toLowerCase();
      if (!label) return;
      if (label.includes("pdf")) {
        showDemoMessage(btn, "In this demo, a PDF report would be generated and downloaded here.");
      } else if (label.includes("csv") || label.includes("excel")) {
        showDemoMessage(btn, "In this demo, a CSV/Excel file would be generated and downloaded here.");
      } else if (label.includes("generate payslips")) {
        showDemoMessage(btn, "In this demo, payslips would be generated for the current period and prepared for Accounts.");
      } else if (label.includes("forward to accounts")) {
        showDemoMessage(btn, "In this demo, summarized payroll data would be forwarded to the Accounts team.");
      } else if (label.includes("download")) {
        showDemoMessage(btn, "In this demo, a read-only summary file would be downloaded.");
      } else if (label.includes("export")) {
        showDemoMessage(btn, "In this demo, the selected report would be exported.");
      } else {
        showDemoMessage(btn, "This is a demo action button. Connect Supabase/back-end to perform the real export.");
      }
    });
  });
}

function wireNotificationButtons() {
  const notifButtons = document.querySelectorAll('button.icon-button[aria-label="Notifications"]');
  notifButtons.forEach((btn) => {
    if (btn.dataset.wiredDemo === "1") return;
    btn.dataset.wiredDemo = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showDemoMessage(btn, "No new notifications yet. Notifications will appear here once the system is in active use.");
    });
  });
}

function wireHeaderActionButtons() {
  // Admin pages have their own concrete implementations for header buttons.
  if (window.location && window.location.pathname.includes("/dashboards/admin/")) {
    return;
  }

  const headerButtons = document.querySelectorAll(".card-header-row .btn.primary, .card-header-row .btn.ghost");
  headerButtons.forEach((btn) => {
    if (btn.dataset.wiredDemo === "1") return;
    btn.dataset.wiredDemo = "1";
    const label = (btn.textContent || "").trim();
    if (!label) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const lower = label.toLowerCase();
      if (lower.includes("add employee")) {
        showDemoMessage(btn, "Use this entry point to add a new employee. In the connected system, this opens a full employee creation form and saves to the database.");
      } else if (lower.includes("upload policy")) {
        showDemoMessage(btn, "In a live system this would open a file picker to upload a policy document and store it for employees to read.");
      } else if (lower.includes("new announcement")) {
        showDemoMessage(btn, "Start drafting a new company announcement. On save, it would appear in the Recent Announcements list for employees.");
      } else if (lower.includes("create user")) {
        showDemoMessage(btn, "Begin creating a new system user account and assign roles. Connect to your auth provider to complete this flow.");
      } else {
        showDemoMessage(btn, "This header button is wired in demo mode. Connect Supabase/back-end logic to complete the action.");
      }
    });
  });
}

function wireEmployeeLeaveForm() {
  const historyBody = document.getElementById("myLeaveHistoryBody");
  if (!historyBody) return;

  const primaryButtons = Array.from(document.querySelectorAll(".card button.btn.primary"));
  const newLeaveBtn = primaryButtons.find((b) => (b.textContent || "").includes("New Leave Request"));
  const submitBtn = primaryButtons.find((b) => (b.textContent || "").includes("Submit Request"));

  if (newLeaveBtn && newLeaveBtn.dataset.wiredDemo !== "1") {
    newLeaveBtn.dataset.wiredDemo = "1";
    newLeaveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const form = newLeaveBtn.closest(".card")?.querySelector(".form");
      if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
      showDemoMessage(newLeaveBtn, "Fill in the leave form below, then click Submit Request to add it to your history (demo mode).");
    });
  }

  if (submitBtn && submitBtn.dataset.wiredDemo !== "1") {
    submitBtn.dataset.wiredDemo = "1";
    submitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const card = submitBtn.closest(".card");
      if (!card) return;
      const select = card.querySelector("select");
      const dateInputs = card.querySelectorAll('input[type="date"]');
      const reasonInput = card.querySelector('input[type="text"]');
      if (!select || dateInputs.length < 2 || !reasonInput) {
        showDemoMessage(submitBtn, "Unable to read the leave form fields in this layout.");
        return;
      }
      const [startInput, endInput] = dateInputs;
      const type = (select.value || select.options[select.selectedIndex]?.text || "Leave").trim();
      const start = startInput.value || "—";
      const end = endInput.value || "—";
      const reason = reasonInput.value?.trim() || "—";

      const placeholderRow = historyBody.querySelector("td[colspan]");
      if (placeholderRow && placeholderRow.parentElement) {
        placeholderRow.parentElement.remove();
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${type}</td>
        <td>${start}</td>
        <td>${end}</td>
        <td>${reason}</td>
        <td>Pending (demo)</td>
      `;
      historyBody.appendChild(tr);
      showDemoMessage(submitBtn, "Leave request recorded in demo mode. In production this would be sent for supervisor approval.");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", onLogoutClick);

  wireExportButtons();
  wireNotificationButtons();
  wireHeaderActionButtons();
  wireEmployeeLeaveForm();
});

