-- Run yourself after migration 04. Synthetic tests only; everything rolls back.
begin;
select set_config('honey.import_member', (select user_id::text from app_private.members where person = 'kirk'), true);
do $$ begin
  if nullif(current_setting('honey.import_member'), '') is null then raise exception 'Provision Kirk first.'; end if;
end $$;
-- Run before importing or entering real expenses; never remove real records to test.
do $$ begin
  if exists(select 1 from public.splitwise_history) or exists(select 1 from public.splitwise_batches) or exists(select 1 from public.expenses) then
    raise exception 'Run import tests on an empty ledger or a separate test project.';
  end if;
end $$;
select set_config('honey.import_rows', '[{"source_row":1,"expense_date":"2000-01-01","description":"Synthetic import test","category":"Payment","currency":"USD","cost_cents":100,"kirk_delta_cents":-100,"jenny_delta_cents":100,"kind":"settlement"}]', true);

set local role anon;
do $$ begin
  begin
    perform public.import_splitwise(current_setting('honey.import_rows')::jsonb, -100);
    raise exception 'FAIL: anonymous import allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform id from public.splitwise_history;
    raise exception 'FAIL: anonymous history read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('honey.import_member'), 'aal', 'aal1')::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.import_splitwise(current_setting('honey.import_rows')::jsonb, -100);
    raise exception 'FAIL: non-MFA import allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.import_splitwise(current_setting('honey.import_rows')::jsonb, -100);
    raise exception 'FAIL: outsider import allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('honey.import_member'), 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.import_splitwise(current_setting('honey.import_rows')::jsonb, 100);
    raise exception 'FAIL: balance mismatch allowed';
  exception when raise_exception then
    if sqlerrm <> 'Balance mismatch; nothing was imported.' then raise; end if;
  end;
  if exists(select 1 from public.splitwise_batches) or exists(select 1 from public.splitwise_history) then raise exception 'FAIL: partial import persisted'; end if;
  begin
    perform public.import_splitwise(current_setting('honey.import_rows')::jsonb || '[{"source_row":2,"expense_date":"2000-01-01","description":"Invalid","category":"General","currency":"EUR","cost_cents":100,"kirk_delta_cents":-100,"jenny_delta_cents":100,"kind":"expense"}]'::jsonb, -200);
    raise exception 'FAIL: invalid second record allowed';
  exception when check_violation then null; end;
  if exists(select 1 from public.splitwise_batches) or exists(select 1 from public.splitwise_history) then raise exception 'FAIL: invalid batch partially persisted'; end if;
  perform public.import_splitwise(current_setting('honey.import_rows')::jsonb, -100);
  if (select count(*) from public.splitwise_history) <> 1 then raise exception 'FAIL: MFA member cannot read history'; end if;
  begin
    perform public.import_splitwise(current_setting('honey.import_rows')::jsonb, -100);
    raise exception 'FAIL: repeated import allowed';
  exception when raise_exception then
    if sqlerrm <> 'History already imported. Refresh; do not retry with another file.' then raise; end if;
  end;
  begin
    delete from public.splitwise_history;
    raise exception 'FAIL: member deleted history';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.splitwise_batches(expected_balance_cents, row_count, created_by) values(0, 1, auth.uid());
    raise exception 'FAIL: member bypassed importer';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.splitwise_history) or exists(select 1 from public.splitwise_batches) then raise exception 'FAIL: outsider can read import'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('honey.import_member'), 'aal', 'aal1')::text, true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.splitwise_history) or exists(select 1 from public.splitwise_batches) then raise exception 'FAIL: non-MFA history read allowed'; end if;
end $$;
reset role;
delete from public.splitwise_history;
delete from public.splitwise_batches;
insert into public.expenses(expense_date, description, amount_cents, paid_by, kirk_share_cents, created_by)
values ('2000-01-01', 'Synthetic existing entry', 100, 'kirk', 50, current_setting('honey.import_member')::uuid);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('honey.import_member'), 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.import_splitwise(current_setting('honey.import_rows')::jsonb, -100);
    raise exception 'FAIL: nonempty ledger import allowed';
  exception when raise_exception then
    if sqlerrm <> 'Initial import requires an empty expense list. Review existing entries first.' then raise; end if;
  end;
end $$;
reset role;
select 'PASS: import access, balance validation, rollback, and repeat protection' as result;
rollback;
