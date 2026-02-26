const Attendance = (function () {
  function getClient() {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client is not available.");
    return client;
  }

  async function logActivity(action, details) {
    try {
      const sb = getClient();
      await sb.from("activity_logs").insert([
        {
          actor_user_id: (await sb.auth.getUser())?.data?.user?.id || null,
          action,
          entity: "attendance",
          details: details || {},
        },
      ]);
    } catch (err) {
      console.warn("Unable to write activity log:", err);
    }
  }

  async function clockIn() {
    const sb = getClient();

    const { data: openRow } = await sb
      .from("attendance")
      .select("id")
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openRow) {
      throw new Error("You already have an open clock-in record.");
    }

    const { data, error } = await sb.from("attendance").insert([{}]).select("id, clock_in").single();
    if (error) throw error;

    await logActivity("clock_in", { attendance_id: data.id, clock_in: data.clock_in });
    return data;
  }

  async function clockOut() {
    const sb = getClient();

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
      .select("id, clock_in, clock_out")
      .single();
    if (error) throw error;

    await logActivity("clock_out", {
      attendance_id: data.id,
      clock_in: data.clock_in,
      clock_out: data.clock_out,
    });
    return data;
  }

  return { clockIn, clockOut };
})();

