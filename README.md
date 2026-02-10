# Employee Management System (EMS)

University project starter for an **Employee Management System** using:
- **HTML / CSS / Vanilla JS**
- **Supabase** (PostgreSQL + Auth)

## Features (included in this starter)
- Auth with Supabase
- Role-based access control (Admin, HR, Manager, Supervisor, Employee)
- Departments (seeded with 3 departments)
- Employee records (basic CRUD skeleton)
- Attendance (clock in/out skeleton)
- Leave (apply/approve skeleton)
- Payroll (basic payslip table skeleton)
- Reports (placeholder)
- Activity logs (basic table)
- **Work ID auto-generation**: sequential per role, format `HR-0001`, `EMP-0001`, etc.
- **Supervisor scoping by department**: supervisors can view/manage employees in their own department

## Project structure
```
dashboards/
employees/
attendance/
leave/
payroll/
reports/
settings/
assets/
  css/
  js/
database/
documentation/
```

## Setup (Supabase)
1. Create a new Supabase project.
2. In Supabase SQL editor, run:
   - `database/schema.sql`
   - `database/rls.sql`
   - `database/seed.sql`
3. In `assets/js/config.js`, set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## Run
Open `index.html` in a browser (or use any simple static server).

## Notes on "Admin creates users"
Creating Supabase Auth users programmatically requires a **server-side** Admin API (service role key).
For a university-level static app, this starter treats "add user" as:
- Admin/HR creates an `employees` record and assigns a `role` + `department_id`
- Work IDs are generated automatically in the database on insert
You can extend this later with a Supabase Edge Function to create Auth users securely.

