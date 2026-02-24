-- Basic seed data for EMS (run after schema.sql)

-- 1) Departments
insert into public.departments (name) values
  ('Operations'),
  ('Sales & Marketing'),
  ('Accounts'),
  ('IT')
on conflict (name) do nothing;

-- 2) Admin employee (link to Supabase Auth user later)
-- After creating the auth user (miracleuturi6@gmail.com) in Supabase,
-- update this row to set auth_user_id = that user's id if desired.
insert into public.employees (email, full_name, role, department_id, work_id)
select
  'miracleuturi6@gmail.com' as email,
  'System Administrator' as full_name,
  'admin'::public.app_role as role,
  d.id as department_id,
  'AD-001' as work_id
from public.departments d
where d.name = 'Operations'
on conflict (email) do nothing;

