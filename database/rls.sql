-- Enable Row Level Security and policies

-- Helper: current user's role
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid()
$$;

-- Departments
alter table public.departments enable row level security;
drop policy if exists "departments_select_auth" on public.departments;
create policy "departments_select_auth"
on public.departments for select
to authenticated
using (true);

-- Profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_role() = 'admin');

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Employees
alter table public.employees enable row level security;

-- Admin/HR full access
drop policy if exists "employees_admin_hr_all" on public.employees;
create policy "employees_admin_hr_all"
on public.employees
for all
to authenticated
using (public.current_role() in ('admin','hr'))
with check (public.current_role() in ('admin','hr'));

-- Supervisor: select employees in their department
drop policy if exists "employees_supervisor_select_department" on public.employees;
create policy "employees_supervisor_select_department"
on public.employees
for select
to authenticated
using (
  public.current_role() = 'supervisor'
  and department_id = public.current_department_id()
);

-- Manager: select employees in their department (simple university-level rule)
drop policy if exists "employees_manager_select_department" on public.employees;
create policy "employees_manager_select_department"
on public.employees
for select
to authenticated
using (
  public.current_role() = 'manager'
  and department_id = public.current_department_id()
);

-- Employee: select their own employee record (by auth_user_id)
drop policy if exists "employees_employee_select_self" on public.employees;
create policy "employees_employee_select_self"
on public.employees
for select
to authenticated
using (public.current_role() = 'employee' and auth_user_id = auth.uid());

-- Attendance
alter table public.attendance enable row level security;
drop policy if exists "attendance_self_rw" on public.attendance;
create policy "attendance_self_rw"
on public.attendance
for all
to authenticated
using (user_id = auth.uid() or public.current_role() in ('admin','hr'))
with check (user_id = auth.uid() or public.current_role() in ('admin','hr'));

-- Leaves
alter table public.leaves enable row level security;
drop policy if exists "leaves_self" on public.leaves;
create policy "leaves_self"
on public.leaves
for select
to authenticated
using (user_id = auth.uid() or public.current_role() in ('admin','hr','manager'));

drop policy if exists "leaves_apply_self" on public.leaves;
create policy "leaves_apply_self"
on public.leaves
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "leaves_decide_manager_hr_admin" on public.leaves;
create policy "leaves_decide_manager_hr_admin"
on public.leaves
for update
to authenticated
using (public.current_role() in ('admin','hr','manager'))
with check (public.current_role() in ('admin','hr','manager'));

-- Payroll
alter table public.payroll enable row level security;
drop policy if exists "payroll_self_read" on public.payroll;
create policy "payroll_self_read"
on public.payroll
for select
to authenticated
using (user_id = auth.uid() or public.current_role() in ('admin','hr'));

drop policy if exists "payroll_hr_admin_manage" on public.payroll;
create policy "payroll_hr_admin_manage"
on public.payroll
for all
to authenticated
using (public.current_role() in ('admin','hr'))
with check (public.current_role() in ('admin','hr'));

-- Activity logs
alter table public.activity_logs enable row level security;
drop policy if exists "activity_logs_admin_hr_read" on public.activity_logs;
create policy "activity_logs_admin_hr_read"
on public.activity_logs
for select
to authenticated
using (public.current_role() in ('admin','hr'));

