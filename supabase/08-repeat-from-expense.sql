-- Owner-run after 06. Adds atomic conversion from a saved or new expense.
begin;
alter table public.recurring_expenses add column if not exists source_type text check(source_type in ('expenses','splitwise_history'));
alter table public.recurring_expenses add column if not exists source_id uuid;
create unique index if not exists recurring_source_once_idx on public.recurring_expenses(source_type,source_id) where source_id is not null;

create or replace function public.save_and_repeat_expense(
  p_source text, p_id uuid, p_version integer, p_new_id uuid, p_values jsonb, p_schedule jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare original_id uuid; original_date date; e public.expenses; h public.splitwise_history; schedule_id uuid;
begin
  if not app_private.has_access() then raise exception 'Membership and current MFA required.' using errcode='42501'; end if;
  if p_source = 'expenses' then
    if p_id is null then
      if p_new_id is null then raise exception 'A request ID is required.'; end if;
      -- A stable client-generated ID makes retries unable to create a second original.
      insert into public.expenses(id,expense_date,description,amount_cents,paid_by,kirk_share_cents,category,notes,tags,created_by)
      values(p_new_id,(p_values->>'expense_date')::date,p_values->>'description',(p_values->>'amount_cents')::bigint,
        p_values->>'paid_by',(p_values->>'kirk_share_cents')::bigint,coalesce(p_values->>'category','General'),coalesce(p_values->>'notes',''),
        array(select jsonb_array_elements_text(coalesce(p_values->'tags','[]'::jsonb))),auth.uid());
      original_id := p_new_id;
    else
      select * into e from public.expenses where id=p_id for update;
      if not found or e.version is distinct from p_version then raise exception 'This entry changed. Refresh and try again.' using errcode='40001'; end if;
      if e.recurring_id is not null then raise exception 'This occurrence already belongs to a schedule.'; end if;
      perform public.change_expense('expenses',p_id,p_version,'edit',p_values);
      original_id := p_id;
    end if;
    select expense_date into original_date from public.expenses where id=original_id;
  elsif p_source = 'splitwise_history' and p_id is not null then
    select * into h from public.splitwise_history where id=p_id for update;
    if not found or h.version is distinct from p_version then raise exception 'This entry changed. Refresh and try again.' using errcode='40001'; end if;
    perform public.change_expense('splitwise_history',p_id,p_version,'edit',p_values);
    original_id := p_id;
    select expense_date into original_date from public.splitwise_history where id=original_id;
  else raise exception 'Invalid expense source.';
  end if;
  if (p_schedule->>'anchor_date')::date <= original_date then raise exception 'The first reminder must be after the original expense date.'; end if;
  if exists(select 1 from public.recurring_expenses where source_type=p_source and source_id=original_id) then raise exception 'This entry already has a recurring schedule.'; end if;
  schedule_id := public.save_recurring(null,null,p_schedule);
  update public.recurring_expenses set source_type=p_source,source_id=original_id where id=schedule_id;
  return schedule_id;
end; $$;
revoke all on function public.save_and_repeat_expense(text,uuid,integer,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.save_and_repeat_expense(text,uuid,integer,uuid,jsonb,jsonb) to authenticated;
commit;
