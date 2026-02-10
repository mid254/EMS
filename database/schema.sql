-- EMS Database Schema (Supabase / Postgres)

-- 1) Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin','hr','manager','supervisor','employee');
  end if;
end $$;

-- 2) Departments (at least 3 departments are seeded in seed.sql)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending', -- pending/approved/rejected
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

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

-- 9) Work ID sequences (separate per role; sequential within each role)
create sequence if not exists public.work_id_admin_seq start 1;
create sequence if not exists public.work_id_hr_seq start 1;
create sequence if not exists public.work_id_manager_seq start 1;
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
    when 'admin' then prefix := 'ADM'; n := nextval('public.work_id_admin_seq');
    when 'hr' then prefix := 'HR'; n := nextval('public.work_id_hr_seq');
    when 'manager' then prefix := 'MGR'; n := nextval('public.work_id_manager_seq');
    when 'supervisor' then prefix := 'SUP'; n := nextval('public.work_id_supervisor_seq');
    else prefix := 'EMP'; n := nextval('public.work_id_employee_seq');
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

