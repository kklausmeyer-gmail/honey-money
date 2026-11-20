-- Run yourself after migration 04. Additive; existing balances are unchanged.
begin;
alter table public.expenses add column if not exists version integer not null default 1;
alter table public.expenses add column if not exists deleted_at timestamptz;
alter table public.splitwise_history add column if not exists version integer not null default 1;
alter table public.splitwise_history add column if not exists deleted_at timestamptz;

-- A refreshed token cannot extend the 30-day MFA period: use its signed AMR timestamp.
create or replace function app_private.has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal' = 'aal2', false)
    and exists(select 1 from app_private.members where user_id = auth.uid())
    and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
      where a->>'method' = 'totp'
      and case when a->>'timestamp' ~ '^\d{1,12}$'
        then (a->>'timestamp')::bigint between extract(epoch from now() - interval '30 days') and extract(epoch from now()) + 60
        else false end);
$$;
create or replace function public.household_access() returns boolean
language sql stable security definer set search_path = '' as $$ select app_private.has_access(); $$;
revoke all on function public.household_access() from public, anon;
grant execute on function public.household_access() to authenticated;

create table if not exists public.expense_changes (
  id uuid primary key default gen_random_uuid(),
  record_source text not null,
  record_id uuid not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  before_record jsonb not null,
  after_record jsonb not null
);
alter table public.expense_changes enable row level security;
revoke all on public.expense_changes from public, anon, authenticated;
grant select on public.expense_changes to authenticated;
drop policy if exists expense_changes_read on public.expense_changes;
create policy expense_changes_read on public.expense_changes for select to authenticated using ((select app_private.has_access()));
create or replace function app_private.log_expense_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.expense_changes(record_source, record_id, changed_by, before_record, after_record)
  values(tg_table_name, old.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end; $$;
revoke all on function app_private.log_expense_change() from public, anon, authenticated;
drop trigger if exists expenses_change_log on public.expenses;
create trigger expenses_change_log after update on public.expenses for each row execute function app_private.log_expense_change();
drop trigger if exists history_change_log on public.splitwise_history;
create trigger history_change_log after update on public.splitwise_history for each row execute function app_private.log_expense_change();

create or replace function public.change_expense(p_source text, p_id uuid, p_version integer, p_action text, p_values jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.expenses; h public.splitwise_history;
begin
  if not app_private.has_access() then raise exception 'Membership and current MFA required.' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('edit','delete','restore') then raise exception 'Invalid action.'; end if;
  if p_source = 'expenses' then
    select * into e from public.expenses where id = p_id for update;
    if not found or e.version is distinct from p_version then raise exception 'This entry changed. Refresh and try again.' using errcode = '40001'; end if;
    if p_action = 'edit' then
      if e.deleted_at is not null then raise exception 'Entry was deleted.'; end if;
      update public.expenses set expense_date = (p_values->>'expense_date')::date,
        description = p_values->>'description', amount_cents = (p_values->>'amount_cents')::bigint,
        paid_by = p_values->>'paid_by', kirk_share_cents = (p_values->>'kirk_share_cents')::bigint,
        category = p_values->>'category', notes = coalesce(p_values->>'notes',''),
        tags = array(select jsonb_array_elements_text(coalesce(p_values->'tags','[]'::jsonb))), version = version + 1
        where id = p_id;
    else
      update public.expenses set deleted_at = case when p_action = 'delete' then now() else null end, version = version + 1 where id = p_id;
    end if;
  elsif p_source = 'splitwise_history' then
    select * into h from public.splitwise_history where id = p_id for update;
    if not found or h.version is distinct from p_version then raise exception 'This entry changed. Refresh and try again.' using errcode = '40001'; end if;
    if p_action = 'edit' then
      if h.deleted_at is not null then raise exception 'Entry was deleted.'; end if;
      update public.splitwise_history set expense_date = (p_values->>'expense_date')::date,
        description = p_values->>'description', category = p_values->>'category',
        kind = case when lower(p_values->>'category') = 'payment' then 'settlement' else 'expense' end,
        cost_cents = (p_values->>'cost_cents')::bigint,
        kirk_delta_cents = (p_values->>'kirk_delta_cents')::bigint,
        jenny_delta_cents = -(p_values->>'kirk_delta_cents')::bigint, version = version + 1 where id = p_id;
    else
      update public.splitwise_history set deleted_at = case when p_action = 'delete' then now() else null end, version = version + 1 where id = p_id;
    end if;
  else raise exception 'Invalid record source.';
  end if;
end; $$;
revoke all on function public.change_expense(text,uuid,integer,text,jsonb) from public, anon;
grant execute on function public.change_expense(text,uuid,integer,text,jsonb) to authenticated;

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check(length(btrim(description)) between 1 and 200),
  amount_cents bigint not null check(amount_cents between 1 and 9999999999),
  paid_by text not null check(paid_by in ('kirk','jenny')),
  kirk_share_cents bigint not null check(kirk_share_cents between 0 and amount_cents),
  category text not null default 'General' check(length(category) <= 80),
  notes text not null default '' check(length(notes) <= 4000),
  tags text[] not null default '{}' check(cardinality(tags) <= 20),
  frequency text not null check(frequency in ('weekly','monthly','quarterly','yearly')),
  anchor_date date not null check(anchor_date >= '1900-01-01'),
  occurrence integer not null default 0 check(occurrence >= 0),
  next_due date not null,
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.recurring_expenses enable row level security;
revoke all on public.recurring_expenses from public, anon, authenticated;
grant select on public.recurring_expenses to authenticated;
drop policy if exists recurring_read on public.recurring_expenses;
create policy recurring_read on public.recurring_expenses for select to authenticated using ((select app_private.has_access()));
alter table public.expenses add column if not exists recurring_id uuid references public.recurring_expenses(id);
alter table public.expenses add column if not exists recurring_occurrence integer;
create unique index if not exists expenses_recurring_once_idx on public.expenses(recurring_id, recurring_occurrence) where recurring_id is not null;
-- Clients cannot forge versions, deletions, or recurring occurrence identifiers.
revoke insert on public.expenses from authenticated;
grant insert(expense_date,description,amount_cents,currency,paid_by,kirk_share_cents,category,tags,notes,created_by) on public.expenses to authenticated;

create or replace function public.save_recurring(p_id uuid, p_version integer, p_values jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.recurring_expenses; result uuid;
begin
  if not app_private.has_access() then raise exception 'Membership and current MFA required.' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.recurring_expenses(description,amount_cents,paid_by,kirk_share_cents,category,notes,tags,frequency,anchor_date,next_due,created_by)
    values(p_values->>'description',(p_values->>'amount_cents')::bigint,p_values->>'paid_by',(p_values->>'kirk_share_cents')::bigint,
      coalesce(p_values->>'category','General'),coalesce(p_values->>'notes',''),array(select jsonb_array_elements_text(coalesce(p_values->'tags','[]'::jsonb))),p_values->>'frequency',(p_values->>'anchor_date')::date,(p_values->>'anchor_date')::date,auth.uid()) returning id into result;
  else
    select * into r from public.recurring_expenses where id = p_id for update;
    if not found or r.version is distinct from p_version then raise exception 'Schedule changed. Refresh and try again.' using errcode = '40001'; end if;
    -- Existing schedules can be paused/resumed. Create a replacement to change the amount or cadence.
    update public.recurring_expenses set active = (p_values->>'active')::boolean, version = version + 1 where id = p_id returning id into result;
  end if;
  return result;
end; $$;
revoke all on function public.save_recurring(uuid,integer,jsonb) from public, anon;
grant execute on function public.save_recurring(uuid,integer,jsonb) to authenticated;

create or replace function public.confirm_recurring(p_id uuid, p_version integer, p_skip boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.recurring_expenses; result uuid; next_date date;
begin
  if not app_private.has_access() then raise exception 'Membership and current MFA required.' using errcode = '42501'; end if;
  if p_skip is null then raise exception 'Choose confirm or skip.'; end if;
  select * into r from public.recurring_expenses where id = p_id for update;
  if not found or r.version is distinct from p_version then raise exception 'This reminder was already handled. Refresh.' using errcode = '40001'; end if;
  if not r.active or r.next_due > (now() at time zone 'America/Los_Angeles')::date then raise exception 'This expense is not due.'; end if;
  if not p_skip then
    insert into public.expenses(expense_date,description,amount_cents,paid_by,kirk_share_cents,category,notes,tags,created_by,recurring_id,recurring_occurrence)
    values(r.next_due,r.description,r.amount_cents,r.paid_by,r.kirk_share_cents,r.category,r.notes,r.tags,auth.uid(),r.id,r.occurrence) returning id into result;
  end if;
  next_date := case r.frequency
    when 'weekly' then r.anchor_date + (r.occurrence + 1) * 7
    when 'monthly' then (r.anchor_date + make_interval(months => r.occurrence + 1))::date
    when 'quarterly' then (r.anchor_date + make_interval(months => (r.occurrence + 1) * 3))::date
    when 'yearly' then (r.anchor_date + make_interval(years => r.occurrence + 1))::date end;
  update public.recurring_expenses set occurrence = occurrence + 1, next_due = next_date, version = version + 1 where id = p_id;
  return result;
end; $$;
revoke all on function public.confirm_recurring(uuid,integer,boolean) from public, anon;
grant execute on function public.confirm_recurring(uuid,integer,boolean) to authenticated;
commit;
