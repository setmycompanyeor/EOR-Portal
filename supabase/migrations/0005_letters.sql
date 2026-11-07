-- Offer letters and contracts generated from Word templates with placeholders.

create type letter_kind as enum ('offer_letter', 'employment_contract', 'relieving_letter', 'other');
create type letter_status as enum ('draft', 'generated', 'issued');

-- Salary structure rules live with pricing (global row or per client).
alter table pricing_configs
  add column if not exists hra_metro_percent numeric(5,2) not null default 50,
  add column if not exists hra_nonmetro_percent numeric(5,2) not null default 40;

-- Per-employee overrides of computed rows, e.g. {"hra": 20000, "flexible_benefits": 15000}
alter table employees add column if not exists salary_overrides jsonb;

create table letter_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,   -- null = available to every client
  kind letter_kind not null default 'offer_letter',
  name text not null,
  storage_path text not null,
  placeholders text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index letter_templates_client_idx on letter_templates (client_id, kind, active);

create table employee_letters (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  template_id uuid not null references letter_templates (id),
  kind letter_kind not null default 'offer_letter',
  values jsonb not null default '{}',          -- placeholder -> value entered in the form
  salary jsonb,                                -- frozen salary breakdown used for generation
  status letter_status not null default 'draft',
  generated_path text,                         -- storage path of the filled .docx
  document_id uuid references documents (id) on delete set null,   -- set once issued
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (employee_id, kind)
);

alter table letter_templates enable row level security;
alter table employee_letters enable row level security;

create policy ops_all on letter_templates for all using (is_ops()) with check (is_ops());
create policy client_read on letter_templates for select using (active and (client_id = auth_client_id() or client_id is null));

create policy ops_all on employee_letters for all using (is_ops()) with check (is_ops());
create policy client_read on employee_letters for select using (client_id = auth_client_id());
create policy client_fill on employee_letters for insert with check (client_id = auth_client_id() and can_approve());
create policy client_edit on employee_letters for update
  using (client_id = auth_client_id() and can_approve() and status <> 'issued')
  with check (client_id = auth_client_id());

-- Templates live under documents/templates/... (ops only); generated letters under <client>/letters/...
create policy templates_ops on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'templates' and is_ops())
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'templates' and is_ops());
