const Attendance = (function () {
  async function clockIn() {
    const { data, error } = await sb.from("attendance").insert([{}]).select("id").single();
    if (error) throw error;
    return data;
  }

  async function clockOut() {
    // Update the latest open attendance record for current user
    const { data: rows, error: selErr } = await sb
      .from("attendance")
      .select("id, clock_out")
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1);
    if (selErr) throw selErr;
    if (!rows?.length) throw new Error("No open clock-in record found");

    const { data, error } = await sb
      .from("attendance")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", rows[0].id)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  return { clockIn, clockOut };
})();

