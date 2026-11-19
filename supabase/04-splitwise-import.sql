-- Owner-run additive migration. No personal records or user IDs are needed.
-- Run in your own Supabase SQL Editor before deploying the importer.
begin;
create table if not exists public.splitwise_batches (
  singleton boolean primary key default true check (singleton),
  id uuid not null unique default gen_random_uuid(),
  expected_balance_cents bigint not null,
  row_count integer not null check (row_count between 1 and 20000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.splitwise_history (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.splitwise_batches(id),
  source_row integer not null check (source_row > 0),
  expense_date date not null check (expense_date >= '1900-01-01'),
  description text not null check (length(btrim(description)) between 1 and 200),
  category text not null check (length(category) <= 80),
  currency text not null check (currency = 'USD'),
  cost_cents bigint not null check (abs(cost_cents::numeric) <= 9999999999),
  kirk_delta_cents bigint not null,
  jenny_delta_cents bigint not null,
  kind text not null check (kind in ('expense', 'settlement')),
  unique(batch_id, source_row),
  check (kirk_delta_cents::numeric + jenny_delta_cents::numeric = 0),
  check (abs(kirk_delta_cents::numeric) <= abs(cost_cents::numeric)),
  check (kind = case when lower(category) = 'payment' then 'settlement' else 'expense' end)
);
alter table public.splitwise_batches enable row level security;
alter table public.splitwise_history enable row level security;
revoke all on public.splitwise_batches, public.splitwise_history from public, anon, authenticated;
grant select on public.splitwise_batches, public.splitwise_history to authenticated;
drop policy if exists splitwise_batches_read on public.splitwise_batches;
create policy splitwise_batches_read on public.splitwise_batches for select to authenticated using ((select app_private.has_access()));
drop policy if exists splitwise_history_read on public.splitwise_history;
create policy splitwise_history_read on public.splitwise_history for select to authenticated using ((select app_private.has_access()));

create or replace function public.import_splitwise(p_rows jsonb, p_expected_balance bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare batch uuid; actual numeric; n integer;
begin
  if not app_private.has_access() then raise exception 'Household membership and MFA required.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Expected an array.'; end if;
  n := jsonb_array_length(p_rows);
  if n < 1 or n > 20000 or p_expected_balance is null then raise exception 'Invalid import size or balance.'; end if;
  -- Serialize competing imports, and exclude normal inserts during the initial import.
  lock table public.splitwise_batches in exclusive mode;
  lock table public.expenses in share row exclusive mode;
  if exists(select 1 from public.splitwise_batches) then raise exception 'History already imported. Refresh; do not retry with another file.'; end if;
  if exists(select 1 from public.expenses) then raise exception 'Initial import requires an empty expense list. Review existing entries first.'; end if;
  insert into public.splitwise_batches(expected_balance_cents, row_count, created_by)
    values(p_expected_balance, n, auth.uid()) returning id into batch;
  insert into public.splitwise_history(batch_id, source_row, expense_date, description, category, currency, cost_cents, kirk_delta_cents, jenny_delta_cents, kind)
    select batch, r.source_row, r.expense_date, r.description, r.category, r.currency, r.cost_cents, r.kirk_delta_cents, r.jenny_delta_cents, r.kind
    from jsonb_to_recordset(p_rows) as r(source_row integer, expense_date date, description text, category text, currency text, cost_cents bigint, kirk_delta_cents bigint, jenny_delta_cents bigint, kind text);
  select sum(kirk_delta_cents::numeric) into actual from public.splitwise_history where batch_id = batch;
  if actual <> p_expected_balance then raise exception 'Balance mismatch; nothing was imported.'; end if;
  return batch;
end;
$$;
revoke all on function public.import_splitwise(jsonb, bigint) from public, anon;
grant execute on function public.import_splitwise(jsonb, bigint) to authenticated;
create index if not exists splitwise_history_date_idx on public.splitwise_history(expense_date desc, id);
commit;
