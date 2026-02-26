-- CREATE TABLE departments (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name TEXT NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE employees (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

--   auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

--   work_id TEXT UNIQUE NOT NULL,

--   email TEXT NOT NULL,

--   full_name TEXT NOT NULL,

--   role TEXT NOT NULL CHECK (
--     role IN ('admin', 'md', 'hr', 'supervisor', 'employee')
--   ),

--   department_id UUID REFERENCES departments(id),

--   created_at TIMESTAMP DEFAULT NOW()
-- );

























-- EMS Database Schema (Supabase / Postgres)

-- 1) Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin','md','hr','supervisor','employee');
  end if;
end $$;

-- 2) Departments
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 3) Employees (admin/HR create records here; Work ID is generated here)
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null unique, -- optional link to auth.users.id
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'employee',
  department_id uuid not null references public.departments(id),
  work_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) Profiles (one row per authenticated user)
-- Supabase convention: profiles.id = auth.users.id
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'employee',
  department_id uuid references public.departments(id),
  work_id text unique,
  phone text,
  address text,
  emergency_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists emergency_contact text;

-- 5) Attendance
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz not null default now()
);

-- 6) Leaves
create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  leave_type text not null default 'Annual',
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending', -- pending/approved/rejected
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.leaves add column if not exists leave_type text not null default 'Annual';
alter table public.leaves alter column user_id set default auth.uid();

-- 6b) Leaves: default user_id to auth.uid()
create or replace function public.leaves_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_leaves_before_insert on public.leaves;
create trigger trg_leaves_before_insert
before insert on public.leaves
for each row execute function public.leaves_before_insert();

-- 7) Payroll
create table if not exists public.payroll (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  basic_salary numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  net_pay numeric(12,2) generated always as (basic_salary + allowances - deductions) stored,
  created_at timestamptz not null default now()
);

-- 8) Activity logs
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- 8b) Admin settings tables
create table if not exists public.job_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_days integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.working_hours (
  id uuid primary key default gen_random_uuid(),
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  working_days text not null default 'Monday - Friday',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  country_code text not null default 'KE',
  created_at timestamptz not null default now(),
  unique (holiday_date, name, country_code)
);

-- 8c) Supervisor task management
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  supervisor_user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null references public.departments(id),
  title text not null,
  description text,
  due_date date,
  status text not null default 'assigned', -- assigned/submitted/approved/rejected
  supervisor_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  assignee_user_id uuid references auth.users(id) on delete set null,
  assignee_work_id text not null,
  assignee_name text not null,
  assignee_status text not null default 'assigned', -- assigned/submitted/approved/rejected
  employee_remarks text,
  supervisor_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, assignee_work_id)
);

-- 9) Work ID sequences (separate per role; sequential within each role)
create sequence if not exists public.work_id_admin_seq start 1;
create sequence if not exists public.work_id_md_seq start 1;
create sequence if not exists public.work_id_hr_seq start 1;
create sequence if not exists public.work_id_supervisor_seq start 1;
create sequence if not exists public.work_id_employee_seq start 1;

create or replace function public.generate_work_id(p_role public.app_role)
returns text
language plpgsql
as $$
declare
  n bigint;
  prefix text;
begin
  case p_role
    when 'admin' then prefix := 'AD';   n := nextval('public.work_id_admin_seq');
    when 'md' then prefix := 'MD';      n := nextval('public.work_id_md_seq');
    when 'hr' then prefix := 'HR';      n := nextval('public.work_id_hr_seq');
    when 'supervisor' then prefix := 'S';   n := nextval('public.work_id_supervisor_seq');
    else prefix := 'EMP';              n := nextval('public.work_id_employee_seq');
  end case;

  return prefix || '-' || lpad(n::text, 4, '0');
end $$;

-- 10) Timestamps
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_working_hours_updated_at on public.working_hours;
create trigger trg_working_hours_updated_at
before update on public.working_hours
for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_task_assignees_updated_at on public.task_assignees;
create trigger trg_task_assignees_updated_at
before update on public.task_assignees
for each row execute function public.set_updated_at();

-- 11) Auto-generate Work ID on employees insert
create or replace function public.employees_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.work_id is null or new.work_id = '' then
    new.work_id := public.generate_work_id(new.role);
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_before_insert on public.employees;
create trigger trg_employees_before_insert
before insert on public.employees
for each row execute function public.employees_before_insert();

-- 12) When an employee record is created/updated, keep profile in sync (if auth_user_id exists)
create or replace function public.sync_profile_from_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null then
    insert into public.profiles (id, email, full_name, role, department_id, work_id)
    values (new.auth_user_id, new.email, new.full_name, new.role, new.department_id, new.work_id)
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          role = excluded.role,
          department_id = excluded.department_id,
          work_id = excluded.work_id,
          updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_sync_profile on public.employees;
create trigger trg_employees_sync_profile
after insert or update on public.employees
for each row execute function public.sync_profile_from_employee();

-- 13) On new auth user: create a profile and (if a matching employee by email exists) adopt its role/department/work_id
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees where lower(email) = lower(new.email) limit 1;

  if found then
    update public.employees set auth_user_id = new.id where id = emp.id;
    insert into public.profiles (id, email, full_name, role, department_id, work_id)
    values (new.id, new.email, emp.full_name, emp.role, emp.department_id, emp.work_id)
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'employee')
    on conflict (id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- 14) Attendance: default user_id to auth.uid()
create or replace function public.attendance_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_attendance_before_insert on public.attendance;
create trigger trg_attendance_before_insert
before insert on public.attendance
for each row execute function public.attendance_before_insert();

