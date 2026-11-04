-- EOR Portal: initial schema
-- Run this in the Supabase SQL editor (or `supabase db push` once the CLI is set up).
-- Multi-tenant: every client-facing row carries client_id; RLS keeps tenants apart.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('client_admin', 'client_approver', 'client_viewer', 'ops_admin', 'ops_staff');
create type client_status as enum ('onboarding', 'active', 'suspended', 'closed');
create type step_status as enum ('pending', 'in_progress', 'done', 'blocked');
create type document_kind as enum ('incorporation', 'board_resolution', 'signatory_id', 'tax_residency', 'msa', 'dpa', 'kyc_other', 'employee_id', 'employee_pan', 'employee_bank', 'employee_uan', 'employee_education', 'employee_payslip', 'offer_letter', 'employment_contract', 'other');
create type document_status as enum ('uploaded', 'verified', 'rejected');
create type employee_status as enum ('requested', 'estimate_sent', 'estimate_approved', 'offer_pending', 'contract_sent', 'active', 'offboarding', 'exited', 'withdrawn');
create type employment_type as enum ('permanent', 'fixed_term');
create type deposit_entry_kind as enum ('received', 'refund', 'required_revised', 'adjustment');
create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');
create type invoice_kind as enum ('monthly', 'one_time', 'deposit');
create type request_category as enum ('equipment', 'benefit', 'salary_revision', 'learning', 'other');
create type request_status as enum ('open', 'quoted', 'approved', 'rejected', 'in_progress', 'fulfilled', 'cancelled');
create type quote_status as enum ('draft', 'sent', 'approved', 'rejected', 'superseded');
create type shipment_status as enum ('ordered', 'packed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'lost');
create type asset_kind as enum ('laptop', 'monitor', 'phone', 'accessory', 'other');
create type asset_status as enum ('ordered', 'in_transit', 'issued', 'returned', 'retired');
create type ops_task_type as enum ('onboarding', 'quote', 'shipment', 'deposit', 'invoice', 'compliance', 'payroll', 'offboarding', 'other');
create type ops_task_status as enum ('open', 'in_progress', 'blocked', 'done');
create type filing_kind as enum ('pf_ecr', 'esi', 'tds', 'professional_tax', 'lwf', 'other');

-- ---------------------------------------------------------------------------
-- Tenants and people
-- ---------------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  country text not null default 'USA',
  billing_address text,
  invoice_currency text not null default 'INR',
  payment_terms_days int not null default 7,
  finance_email text,
  status client_status not null default 'onboarding',
  account_manager_id uuid,
  zoho_contact_id text,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  full_name text not null default '',
  email text not null default '',
  job_title text,
  role user_role not null default 'client_viewer',
  created_at timestamptz not null default now()
);
create index profiles_client_idx on profiles (client_id);
alter table clients add constraint clients_account_manager_fk foreign key (account_manager_id) references profiles (id) on delete set null;

-- Create a profile row whenever a user signs up or is invited.
-- Invitations carry client_id and role in user metadata.
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
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Helpers used by RLS policies. SECURITY DEFINER so they can read profiles
-- without recursing into the profiles policy.
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;
create or replace function auth_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from profiles where id = auth.uid()
$$;
create or replace function is_ops() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('ops_admin', 'ops_staff'), false)
$$;
create or replace function can_approve() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('client_admin', 'client_approver'), false)
$$;

-- ---------------------------------------------------------------------------
-- Client onboarding
-- ---------------------------------------------------------------------------
create table client_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  key text not null,                       -- account_created, kyc, agreements, deposit, first_hire
  label text not null,
  sort int not null default 0,
  status step_status not null default 'pending',
  note text,
  completed_at timestamptz,
  unique (client_id, key)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  employee_id uuid,                        -- set for employee documents
  kind document_kind not null,
  name text not null,
  storage_path text,                       -- path in the 'documents' storage bucket
  size_bytes bigint,
  status document_status not null default 'uploaded',
  uploaded_by uuid references profiles (id),
  verified_by uuid references profiles (id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index documents_client_idx on documents (client_id);

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table employees (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  full_name text not null,
  email text,
  job_title text not null,
  location_city text,
  location_state text,
  employment_type employment_type not null default 'permanent',
  probation_months int not null default 3,
  start_date date,
  end_date date,
  monthly_gross numeric(12,2) not null,
  status employee_status not null default 'requested',
  keka_employee_id text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index employees_client_idx on employees (client_id);
alter table documents add constraint documents_employee_fk foreign key (employee_id) references employees (id) on delete cascade;

create table employee_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  key text not null,
  label text not null,
  detail text,
  owner text not null default 'ops',      -- client | ops | employee
  sort int not null default 0,
  status step_status not null default 'pending',
  completed_at timestamptz,
  unique (employee_id, key)
);

-- ---------------------------------------------------------------------------
-- Pricing and estimates
-- ---------------------------------------------------------------------------
create table pricing_configs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,   -- null = global default
  fee_per_employee numeric(12,2) not null default 15000,
  fee_percent numeric(6,3) not null default 0,                -- added on top of flat fee if > 0
  insurance_per_month numeric(12,2) not null default 800,
  gst_rate numeric(5,2) not null default 18,
  gst_on_full_invoice boolean not null default false,
  deposit_months int not null default 2,
  basic_percent numeric(5,2) not null default 50,
  pf_wage_cap numeric(12,2) not null default 15000,
  pf_on_full_basic boolean not null default false,
  esi_wage_ceiling numeric(12,2) not null default 21000,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);
create unique index pricing_configs_one_global on pricing_configs ((client_id is null)) where client_id is null;

create table estimates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,   -- null for public estimator
  employee_id uuid references employees (id) on delete set null,
  inputs jsonb not null,
  result jsonb not null,
  contact_email text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Deposits and invoices
-- ---------------------------------------------------------------------------
create table deposit_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  entry_date date not null default current_date,
  kind deposit_entry_kind not null,
  amount numeric(12,2) not null default 0,          -- money movement (received / refund / adjustment)
  required_amount numeric(12,2),                     -- for required_revised entries
  reference text,
  note text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index deposit_entries_client_idx on deposit_entries (client_id, entry_date);

create view deposit_balances as
select
  c.id as client_id,
  coalesce(sum(case when d.kind = 'received' then d.amount when d.kind = 'refund' then -d.amount when d.kind = 'adjustment' then d.amount else 0 end), 0) as held,
  coalesce((select required_amount from deposit_entries r where r.client_id = c.id and r.kind = 'required_revised' order by entry_date desc, created_at desc limit 1), 0) as required
from clients c
left join deposit_entries d on d.client_id = c.id
group by c.id;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  number text not null unique,
  kind invoice_kind not null default 'monthly',
  period_start date,
  period_end date,
  issue_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12,2) not null default 0,
  gst numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status invoice_status not null default 'draft',
  paid_at date,
  zoho_invoice_id text,
  pdf_path text,
  created_at timestamptz not null default now()
);
create index invoices_client_idx on invoices (client_id, issue_date desc);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  employee_id uuid references employees (id) on delete set null,
  description text not null,
  amount numeric(12,2) not null,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Requests, quotes, shipments, assets
-- ---------------------------------------------------------------------------
create table requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  employee_id uuid references employees (id) on delete set null,
  number serial,
  category request_category not null,
  title text not null,
  description text,
  status request_status not null default 'open',
  raised_by uuid references profiles (id),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index requests_client_idx on requests (client_id, created_at desc);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  total numeric(12,2) not null default 0,
  note text,
  valid_until date,
  status quote_status not null default 'draft',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  label text not null,
  amount numeric(12,2) not null,
  sort int not null default 0
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  tag text not null unique,
  kind asset_kind not null,
  model text not null,
  serial text,
  holder_employee_id uuid references employees (id) on delete set null,
  status asset_status not null default 'ordered',
  purchase_cost numeric(12,2),
  issued_at date,
  returned_at date,
  created_at timestamptz not null default now()
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  request_id uuid references requests (id) on delete set null,
  employee_id uuid references employees (id) on delete set null,
  asset_id uuid references assets (id) on delete set null,
  title text not null,
  courier text,
  awb text,
  tracking_url text,
  deliver_to text,
  status shipment_status not null default 'ordered',
  expected_date date,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index shipments_client_idx on shipments (client_id);

create table shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  status shipment_status not null,
  note text,
  location text,
  occurred_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ops, compliance, activity
-- ---------------------------------------------------------------------------
create table ops_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,
  type ops_task_type not null,
  title text not null,
  detail text,
  owner_id uuid references profiles (id),
  due_date date,
  status ops_task_status not null default 'open',
  link_table text,
  link_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ops_tasks_open_idx on ops_tasks (status, due_date);

create table compliance_filings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,  -- null = covers all clients
  kind filing_kind not null,
  period text not null,          -- e.g. 2026-10
  due_date date,
  filed_on date,
  challan_path text,
  note text
);

create table activity_log (
  id bigserial primary key,
  client_id uuid references clients (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  verb text not null,
  subject_table text,
  subject_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_client_idx on activity_log (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table clients enable row level security;
alter table profiles enable row level security;
alter table client_onboarding_steps enable row level security;
alter table documents enable row level security;
alter table employees enable row level security;
alter table employee_onboarding_tasks enable row level security;
alter table pricing_configs enable row level security;
alter table estimates enable row level security;
alter table deposit_entries enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table requests enable row level security;
alter table quotes enable row level security;
alter table quote_lines enable row level security;
alter table assets enable row level security;
alter table shipments enable row level security;
alter table shipment_events enable row level security;
alter table ops_tasks enable row level security;
alter table compliance_filings enable row level security;
alter table activity_log enable row level security;

-- Ops staff: full access everywhere.
create policy ops_all on clients for all using (is_ops()) with check (is_ops());
create policy ops_all on profiles for all using (is_ops()) with check (is_ops());
create policy ops_all on client_onboarding_steps for all using (is_ops()) with check (is_ops());
create policy ops_all on documents for all using (is_ops()) with check (is_ops());
create policy ops_all on employees for all using (is_ops()) with check (is_ops());
create policy ops_all on employee_onboarding_tasks for all using (is_ops()) with check (is_ops());
create policy ops_all on pricing_configs for all using (is_ops()) with check (is_ops());
create policy ops_all on estimates for all using (is_ops()) with check (is_ops());
create policy ops_all on deposit_entries for all using (is_ops()) with check (is_ops());
create policy ops_all on invoices for all using (is_ops()) with check (is_ops());
create policy ops_all on invoice_lines for all using (is_ops()) with check (is_ops());
create policy ops_all on requests for all using (is_ops()) with check (is_ops());
create policy ops_all on quotes for all using (is_ops()) with check (is_ops());
create policy ops_all on quote_lines for all using (is_ops()) with check (is_ops());
create policy ops_all on assets for all using (is_ops()) with check (is_ops());
create policy ops_all on shipments for all using (is_ops()) with check (is_ops());
create policy ops_all on shipment_events for all using (is_ops()) with check (is_ops());
create policy ops_all on ops_tasks for all using (is_ops()) with check (is_ops());
create policy ops_all on compliance_filings for all using (is_ops()) with check (is_ops());
create policy ops_all on activity_log for all using (is_ops()) with check (is_ops());

-- Client users: read their own tenant.
create policy client_read on clients for select using (id = auth_client_id());
create policy client_read on profiles for select using (id = auth.uid() or client_id = auth_client_id());
create policy client_read on client_onboarding_steps for select using (client_id = auth_client_id());
create policy client_read on documents for select using (client_id = auth_client_id());
create policy client_read on employees for select using (client_id = auth_client_id());
create policy client_read on employee_onboarding_tasks for select using (employee_id in (select id from employees where client_id = auth_client_id()));
create policy client_read on pricing_configs for select using (client_id = auth_client_id() or client_id is null);
create policy client_read on estimates for select using (client_id = auth_client_id());
create policy client_read on deposit_entries for select using (client_id = auth_client_id());
create policy client_read on invoices for select using (client_id = auth_client_id());
create policy client_read on invoice_lines for select using (invoice_id in (select id from invoices where client_id = auth_client_id()));
create policy client_read on requests for select using (client_id = auth_client_id());
create policy client_read on quotes for select using (request_id in (select id from requests where client_id = auth_client_id()));
create policy client_read on quote_lines for select using (quote_id in (select q.id from quotes q join requests r on r.id = q.request_id where r.client_id = auth_client_id()));
create policy client_read on assets for select using (client_id = auth_client_id());
create policy client_read on shipments for select using (client_id = auth_client_id());
create policy client_read on shipment_events for select using (shipment_id in (select id from shipments where client_id = auth_client_id()));
create policy client_read on compliance_filings for select using (client_id = auth_client_id() or client_id is null);
create policy client_read on activity_log for select using (client_id = auth_client_id());

-- Client users: the writes the portal allows them.
create policy client_update_profile on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy client_update_client on clients for update using (id = auth_client_id() and auth_role() = 'client_admin') with check (id = auth_client_id());
create policy client_upload_docs on documents for insert with check (client_id = auth_client_id() and auth_role() in ('client_admin', 'client_approver'));
create policy client_hire on employees for insert with check (client_id = auth_client_id() and auth_role() in ('client_admin', 'client_approver'));
create policy client_update_employee on employees for update using (client_id = auth_client_id() and auth_role() in ('client_admin', 'client_approver')) with check (client_id = auth_client_id());
create policy client_task_update on employee_onboarding_tasks for update using (owner = 'client' and employee_id in (select id from employees where client_id = auth_client_id()));
create policy client_estimate on estimates for insert with check (client_id = auth_client_id());
create policy client_raise_request on requests for insert with check (client_id = auth_client_id() and auth_role() in ('client_admin', 'client_approver'));
create policy client_decide_request on requests for update using (client_id = auth_client_id() and can_approve()) with check (client_id = auth_client_id());
create policy client_decide_quote on quotes for update using (can_approve() and request_id in (select id from requests where client_id = auth_client_id()));
create policy client_log on activity_log for insert with check (client_id = auth_client_id());

-- Public estimator: anyone can read the global pricing config and save an estimate.
create policy anon_pricing on pricing_configs for select to anon using (client_id is null);
create policy anon_estimate on estimates for insert to anon with check (client_id is null);

-- ---------------------------------------------------------------------------
-- Storage bucket for documents (private; access via signed URLs from the server)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy docs_ops_all on storage.objects for all
  using (bucket_id = 'documents' and is_ops()) with check (bucket_id = 'documents' and is_ops());
create policy docs_client_rw on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth_client_id()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth_client_id()::text);

-- ---------------------------------------------------------------------------
-- Global default pricing
-- ---------------------------------------------------------------------------
insert into pricing_configs (client_id) values (null);
