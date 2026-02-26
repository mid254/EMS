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

-- Helper: check if current user is assignee of a task (RLS-safe)
create or replace function public.is_task_assignee(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_assignees ta
    where ta.task_id = p_task_id
      and ta.assignee_user_id = auth.uid()
  )
$$;

-- Helper: check if current user can manage a task (RLS-safe)
create or replace function public.can_manage_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        (public.current_role() = 'supervisor'
          and t.supervisor_user_id = auth.uid()
          and t.department_id = public.current_department_id())
        or public.current_role() in ('admin','hr','md')
      )
  )
$$;

-- Departments
alter table public.departments enable row level security;
drop policy if exists "departments_select_auth" on public.departments;
create policy "departments_select_auth"
on public.departments for select
to authenticated
using (true);

drop policy if exists "departments_admin_manage" on public.departments;
create policy "departments_admin_manage"
on public.departments for all
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

-- Profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_role() in ('admin','md'));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Employees
alter table public.employees enable row level security;

-- Admin/HR/MD full access
drop policy if exists "employees_admin_hr_all" on public.employees;
drop policy if exists "employees_admin_hr_md_all" on public.employees;
create policy "employees_admin_hr_md_all"
on public.employees
for all
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

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

-- Any authenticated user: can select their own employee record (needed for login redirects)
drop policy if exists "employees_select_self" on public.employees;
drop policy if exists "employees_employee_select_self" on public.employees;
create policy "employees_select_self"
on public.employees
for select
to authenticated
using (auth_user_id = auth.uid());

-- Attendance
alter table public.attendance enable row level security;
drop policy if exists "attendance_self_rw" on public.attendance;
create policy "attendance_self_rw"
on public.attendance
for all
to authenticated
using (user_id = auth.uid() or public.current_role() in ('admin','hr','md'))
with check (user_id = auth.uid() or public.current_role() in ('admin','hr','md'));

-- Leaves
alter table public.leaves enable row level security;
drop policy if exists "leaves_self" on public.leaves;
create policy "leaves_self"
on public.leaves
for select
to authenticated
using (user_id = auth.uid() or public.current_role() in ('admin','hr','md'));

drop policy if exists "leaves_apply_self" on public.leaves;
create policy "leaves_apply_self"
on public.leaves
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "leaves_decide_manager_hr_admin" on public.leaves;
drop policy if exists "leaves_decide_md_hr_admin" on public.leaves;
create policy "leaves_decide_md_hr_admin"
on public.leaves
for update
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

-- Payroll
alter table public.payroll enable row level security;
drop policy if exists "payroll_self_read" on public.payroll;
create policy "payroll_self_read"
on public.payroll
for select
to authenticated
using (user_id = auth.uid() or public.current_role() in ('admin','hr','md'));

drop policy if exists "payroll_hr_admin_manage" on public.payroll;
create policy "payroll_hr_admin_manage"
on public.payroll
for all
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

-- Activity logs
alter table public.activity_logs enable row level security;
drop policy if exists "activity_logs_admin_hr_read" on public.activity_logs;
create policy "activity_logs_admin_hr_read"
on public.activity_logs
for select
to authenticated
using (public.current_role() in ('admin','hr','md'));

drop policy if exists "activity_logs_self_read" on public.activity_logs;
create policy "activity_logs_self_read"
on public.activity_logs
for select
to authenticated
using (actor_user_id = auth.uid());

drop policy if exists "activity_logs_self_insert" on public.activity_logs;
create policy "activity_logs_self_insert"
on public.activity_logs
for insert
to authenticated
with check (actor_user_id = auth.uid());

drop policy if exists "activity_logs_self_update" on public.activity_logs;
create policy "activity_logs_self_update"
on public.activity_logs
for update
to authenticated
using (actor_user_id = auth.uid())
with check (actor_user_id = auth.uid());

drop policy if exists "activity_logs_admin_update" on public.activity_logs;
create policy "activity_logs_admin_update"
on public.activity_logs
for update
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

drop policy if exists "activity_logs_broadcast_read" on public.activity_logs;
create policy "activity_logs_broadcast_read"
on public.activity_logs
for select
to authenticated
using (coalesce(details->>'notify_all', 'false') = 'true');

drop policy if exists "activity_logs_recipient_read" on public.activity_logs;
create policy "activity_logs_recipient_read"
on public.activity_logs
for select
to authenticated
using (
  details ? 'recipient_user_id'
  and details->>'recipient_user_id' = auth.uid()::text
);

-- Job roles
alter table public.job_roles enable row level security;
drop policy if exists "job_roles_select_auth" on public.job_roles;
create policy "job_roles_select_auth"
on public.job_roles for select
to authenticated
using (true);
drop policy if exists "job_roles_admin_manage" on public.job_roles;
create policy "job_roles_admin_manage"
on public.job_roles for all
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

-- Leave types
alter table public.leave_types enable row level security;
drop policy if exists "leave_types_select_auth" on public.leave_types;
create policy "leave_types_select_auth"
on public.leave_types for select
to authenticated
using (true);
drop policy if exists "leave_types_admin_manage" on public.leave_types;
create policy "leave_types_admin_manage"
on public.leave_types for all
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

-- Working hours
alter table public.working_hours enable row level security;
drop policy if exists "working_hours_select_auth" on public.working_hours;
create policy "working_hours_select_auth"
on public.working_hours for select
to authenticated
using (true);
drop policy if exists "working_hours_admin_manage" on public.working_hours;
create policy "working_hours_admin_manage"
on public.working_hours for all
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

-- Holidays
alter table public.holidays enable row level security;
drop policy if exists "holidays_select_auth" on public.holidays;
create policy "holidays_select_auth"
on public.holidays for select
to authenticated
using (true);
drop policy if exists "holidays_admin_manage" on public.holidays;
create policy "holidays_admin_manage"
on public.holidays for all
to authenticated
using (public.current_role() in ('admin','hr','md'))
with check (public.current_role() in ('admin','hr','md'));

-- Tasks
alter table public.tasks enable row level security;
drop policy if exists "tasks_supervisor_manage_own_department" on public.tasks;
create policy "tasks_supervisor_manage_own_department"
on public.tasks for all
to authenticated
using (
  (public.current_role() = 'supervisor' and supervisor_user_id = auth.uid() and department_id = public.current_department_id())
  or public.current_role() in ('admin','hr','md')
)
with check (
  (public.current_role() = 'supervisor' and supervisor_user_id = auth.uid() and department_id = public.current_department_id())
  or public.current_role() in ('admin','hr','md')
);

drop policy if exists "tasks_employee_read_assigned" on public.tasks;
create policy "tasks_employee_read_assigned"
on public.tasks for select
to authenticated
using (public.is_task_assignee(tasks.id));

-- Task assignees
alter table public.task_assignees enable row level security;
drop policy if exists "task_assignees_supervisor_manage" on public.task_assignees;
drop policy if exists "task_assignees_supervisor_select" on public.task_assignees;
create policy "task_assignees_supervisor_select"
on public.task_assignees for select
to authenticated
using (
  public.current_role() in ('admin','hr','md')
  or (
    public.current_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = task_assignees.assignee_user_id
        and p.department_id = public.current_department_id()
    )
  )
);

drop policy if exists "task_assignees_supervisor_insert" on public.task_assignees;
create policy "task_assignees_supervisor_insert"
on public.task_assignees for insert
to authenticated
with check (public.can_manage_task(task_assignees.task_id));

drop policy if exists "task_assignees_supervisor_update" on public.task_assignees;
create policy "task_assignees_supervisor_update"
on public.task_assignees for update
to authenticated
using (public.can_manage_task(task_assignees.task_id))
with check (public.can_manage_task(task_assignees.task_id));

drop policy if exists "task_assignees_supervisor_delete" on public.task_assignees;
create policy "task_assignees_supervisor_delete"
on public.task_assignees for delete
to authenticated
using (public.can_manage_task(task_assignees.task_id));

drop policy if exists "task_assignees_employee_read_self" on public.task_assignees;
create policy "task_assignees_employee_read_self"
on public.task_assignees for select
to authenticated
using (assignee_user_id = auth.uid());

drop policy if exists "task_assignees_employee_update_self" on public.task_assignees;
create policy "task_assignees_employee_update_self"
on public.task_assignees for update
to authenticated
using (assignee_user_id = auth.uid())
with check (assignee_user_id = auth.uid());

