-- In-portal notifications (no email yet). One row per recipient.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  client_id uuid references clients (id) on delete cascade,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, read_at, created_at desc);

alter table notifications enable row level security;
create policy own_read on notifications for select using (user_id = auth.uid());
create policy own_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ops_all on notifications for all using (is_ops()) with check (is_ops());

-- Fan-out helpers. SECURITY DEFINER so a client user's action (e.g. approving a
-- quote) can notify ops staff, and an ops action can notify a client's users.
create or replace function notify_client_users(p_client_id uuid, p_title text, p_body text, p_href text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (user_id, client_id, title, body, href)
  select id, p_client_id, p_title, p_body, p_href from profiles where client_id = p_client_id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function notify_ops(p_client_id uuid, p_title text, p_body text, p_href text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (user_id, client_id, title, body, href)
  select id, p_client_id, p_title, p_body, p_href from profiles where role in ('ops_admin', 'ops_staff');
  get diagnostics n = row_count;
  return n;
end $$;

-- Only signed-in users may call the helpers (never anon).
revoke execute on function notify_client_users(uuid, text, text, text) from public, anon;
revoke execute on function notify_ops(uuid, text, text, text) from public, anon;
grant execute on function notify_client_users(uuid, text, text, text) to authenticated;
grant execute on function notify_ops(uuid, text, text, text) to authenticated;
