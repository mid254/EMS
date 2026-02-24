const Departments = (function () {
  function getClient() {
    const sb = window.supabaseClient;
    if (!sb) {
      throw new Error("Supabase client not configured. Check supabase-client.js.");
    }
    return sb;
  }

  async function listDepartments() {
    const sb = getClient();
    const { data, error } = await sb
      .from("departments")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function getOrCreateDepartmentByName(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      throw new Error("Department name is required");
    }
    const sb = getClient();

    const { data: existing, error: selError } = await sb
      .from("departments")
      .select("id, name")
      .ilike("name", trimmed)
      .maybeSingle();

    if (!selError && existing) {
      return existing;
    }

    const { data, error } = await sb
      .from("departments")
      .insert([{ name: trimmed }])
      .select("id, name")
      .single();
    if (error) throw error;
    return data;
  }

  function fillSelect(selectEl, departments) {
    selectEl.innerHTML = "";
    for (const d of departments ?? []) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      selectEl.appendChild(opt);
    }
  }

  return { listDepartments, getOrCreateDepartmentByName, fillSelect };
})();
