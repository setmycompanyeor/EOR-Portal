-- Employees do not log in to this app (they use the payroll software), so the
-- short-lived employee-portal objects are removed. Kept for history because
-- the original was applied to the production project before the decision.
-- The 'employee' value remains on the user_role enum (Postgres cannot drop
-- enum values); nothing grants it.

drop policy if exists employee_read on employees;
drop policy if exists employee_read on clients;
drop policy if exists employee_read on employee_onboarding_tasks;
drop policy if exists employee_task_update on employee_onboarding_tasks;
drop policy if exists employee_read on documents;
drop policy if exists employee_upload on documents;
drop policy if exists employee_read on shipments;
drop policy if exists employee_read on shipment_events;
drop policy if exists employee_read on assets;
drop policy if exists docs_employee_rw on storage.objects;

drop function if exists notify_employee(uuid, text, text, text);
drop function if exists employee_client_id();
drop function if exists is_employee();
drop function if exists auth_employee_id();

-- Restore the original profile trigger (no employee_id).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, client_id, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'client_id', '')::uuid,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'client_admin')
  );
  return new;
end $$;

drop index if exists profiles_employee_idx;
alter table profiles drop column if exists employee_id;
