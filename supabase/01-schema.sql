-- Run yourself in the Supabase SQL Editor. No expense data is required.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table if not exists app_private.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person text not null unique check (person in ('jenny', 'kirk'))
);
alter table app_private.members enable row level security;
revoke all on app_private.members from public, anon, authenticated;

create or replace function app_private.has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
    and exists (select 1 from app_private.members where user_id = (select auth.uid()));
$$;
revoke all on function app_private.has_access() from public, anon;
grant execute on function app_private.has_access() to authenticated;

-- This reveals only the caller's own membership, before MFA enrollment.
create or replace function public.my_membership() returns text
language sql stable security definer set search_path = '' as $$
  select person from app_private.members where user_id = (select auth.uid());
$$;
revoke all on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  description text not null check (length(btrim(description)) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  currency text not null default 'USD' check (currency = 'USD'),
  paid_by text not null check (paid_by in ('kirk', 'jenny')),
  kirk_share_cents bigint not null check (kirk_share_cents >= 0 and kirk_share_cents <= amount_cents),
  category text not null default 'General' check (length(category) <= 80),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  notes text not null default '' check (length(notes) <= 4000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
revoke all on public.expenses from public, anon, authenticated;
-- Editing/deletion will arrive with a proper change history. Start append-only.
grant select, insert on public.expenses to authenticated;
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using ((select app_private.has_access()));
drop policy if exists expenses_add on public.expenses;
create policy expenses_add on public.expenses for insert to authenticated
  with check ((select app_private.has_access()) and created_by = (select auth.uid()));
create index if not exists expenses_date_idx on public.expenses(expense_date desc, id);
commit;
