document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole([Roles.admin]);
  if (!profile) return;

  const main = document.getElementById("welcomeMain");
  const sub = document.getElementById("welcomeSub");
  if (main) main.textContent = `Welcome, ${profile.full_name || "Admin"}`;
  if (sub) sub.textContent = `${roleLabel(profile.role)} • ${profile.work_id || profile.email || ""}`;

  try {
    await refreshDashboardStats();
  } catch (err) {
    console.error("Failed to load admin dashboard stats:", err);
  }
});

async function refreshDashboardStats() {
  const sb = window.supabaseClient;
  if (!sb) {
    console.warn("Supabase client not available; cannot load stats.");
    return;
  }

  // Total employees
  try {
    const totalEmployees = await Employees.countEmployees();
    setText("totalEmployeesCount", String(totalEmployees));
  } catch (err) {
    console.error("Error loading total employees:", err);
    setText("totalEmployeesCount", "--");
  }

  // Total departments
  try {
    const departments = await Departments.listDepartments();
    setText("totalDepartmentsCount", String(departments.length || 0));
  } catch (err) {
    console.error("Error loading departments:", err);
    setText("totalDepartmentsCount", "--");
  }

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayDate = `${yyyy}-${mm}-${dd}`;

  // Present today (distinct user_ids with attendance today)
  let presentCount = 0;
  try {
    const { count, error } = await sb
      .from("attendance")
      .select("user_id", { head: true, count: "exact" })
      .gte("clock_in", `${todayDate}T00:00:00`)
      .lte("clock_in", `${todayDate}T23:59:59`);
    if (error) throw error;
    presentCount = count || 0;
    setText("presentTodayCount", String(presentCount));
  } catch (err) {
    console.error("Error loading attendance stats:", err);
    setText("presentTodayCount", "--");
  }

  // Employees currently on leave today (approved or pending)
  let onLeaveCount = 0;
  try {
    const { count, error } = await sb
      .from("leaves")
      .select("id", { head: true, count: "exact" })
      .lte("start_date", todayDate)
      .gte("end_date", todayDate)
      .in("status", ["pending", "approved"]);
    if (error) throw error;
    onLeaveCount = count || 0;
  } catch (err) {
    console.error("Error loading leave stats:", err);
  }

  // Pending leave requests (all)
  try {
    const { count, error } = await sb
      .from("leaves")
      .select("id", { head: true, count: "exact" })
      .eq("status", "pending");
    if (error) throw error;
    setText("pendingLeaveCount", String(count || 0));
  } catch (err) {
    console.error("Error loading pending leave requests:", err);
    setText("pendingLeaveCount", "--");
  }

  // Absent / on leave today: combine on-leave with simple estimate of absent.
  try {
    const totalEmployees = await Employees.countEmployees();
    const estimatedAbsent = Math.max(totalEmployees - presentCount - onLeaveCount, 0);
    const combined = estimatedAbsent + onLeaveCount;
    setText("absentTodayCount", String(combined));
  } catch (err) {
    console.error("Error computing absent/on-leave count:", err);
    setText("absentTodayCount", "--");
  }

  // Payroll status for current month
  try {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startStr = monthStart.toISOString().slice(0, 10);
    const endStr = monthEnd.toISOString().slice(0, 10);

    const { count, error } = await sb
      .from("payroll")
      .select("id", { head: true, count: "exact" })
      .gte("period_start", startStr)
      .lte("period_end", endStr);
    if (error) throw error;

    if (count && count > 0) {
      setText(
        "payrollStatus",
        `Payroll generated for ${count} record${count === 1 ? "" : "s"} this month.`
      );
    } else {
      setText("payrollStatus", "No payroll records for this month yet.");
    }
  } catch (err) {
    console.error("Error loading payroll status:", err);
    setText("payrollStatus", "Payroll status unavailable.");
  }
}

