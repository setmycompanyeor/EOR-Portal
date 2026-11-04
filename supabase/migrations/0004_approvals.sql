-- Approvals: leave and reimbursement requests that originate in the payroll
-- software (Keka). The client decides here; SetMyCompany ops then applies the
-- decision in Keka by hand and marks it synced. Approved reimbursements are
-- billed on the next monthly invoice.

create type approval_kind as enum ('leave', 'reimbursement');
create type approval_status as enum ('pending', 'approved', 'rejected', 'synced');

create table approvals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  kind approval_kind not null,
  title text not null,
  detail text,
  amount numeric(12,2),                 -- reimbursement amount
  from_date date,                       -- leave
  to_date date,
  leave_type text,
  category text,                        -- reimbursement category (travel, meals, ...)
  receipt_path text,                    -- storage path of the receipt, if uploaded
  keka_reference text,                  -- Keka request / claim id
  status approval_status not null default 'pending',
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text,
  synced_by uuid references profiles (id),
  synced_at timestamptz,
  invoice_id uuid references invoices (id) on delete set null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index approvals_client_idx on approvals (client_id, status, created_at desc);
create unique index approvals_keka_ref_idx on approvals (keka_reference) where keka_reference is not null;

alter table approvals enable row level security;
create policy ops_all on approvals for all using (is_ops()) with check (is_ops());
create policy client_read on approvals for select using (client_id = auth_client_id());
create policy client_decide on approvals for update
  using (client_id = auth_client_id() and can_approve() and status = 'pending')
  with check (client_id = auth_client_id());
