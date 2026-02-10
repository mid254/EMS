-- Seed departments (at least 3)
insert into public.departments (name) values
  ('Operations'),
  ('Sales'),
  ('IT')
on conflict (name) do nothing;

