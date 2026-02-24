// Placeholder utilities for future Supabase-backed departments module.
const Departments = (function () {
  function fillSelect(selectEl, departments) {
    selectEl.innerHTML = "";
    for (const d of departments ?? []) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      selectEl.appendChild(opt);
    }
  }

  return { fillSelect };
})();
