-- Synthetic records only; safe alongside real expenses. All changes roll back.
begin;
select set_config('honey.repeat_member',(select user_id::text from app_private.members where person='kirk'),true);
select set_config('honey.repeat_expense',gen_random_uuid()::text,true);
select set_config('honey.repeat_schedule','{"description":"Synthetic future","amount_cents":100,"paid_by":"kirk","kirk_share_cents":50,"frequency":"monthly","anchor_date":"2000-02-01"}',true);
select set_config('honey.repeat_values','{"description":"Synthetic original","expense_date":"2000-01-01","amount_cents":100,"paid_by":"kirk","kirk_share_cents":50,"category":"General","notes":"","tags":[]}',true);
do $$ begin
  if nullif(current_setting('honey.repeat_member'),'') is null then raise exception 'Provision Kirk first.'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('honey.repeat_member'),'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true);
set local role authenticated;
do $$ declare s uuid; test_id uuid; v integer; begin
  -- Invalid schedule must roll back the newly inserted expense too.
  begin
    perform public.save_and_repeat_expense('expenses',null,null,current_setting('honey.repeat_expense')::uuid,current_setting('honey.repeat_values')::jsonb,
      current_setting('honey.repeat_schedule')::jsonb || '{"frequency":"invalid"}'::jsonb);
    raise exception 'FAIL: invalid frequency allowed';
  exception when check_violation then null; end;
  if exists(select 1 from public.expenses where id=current_setting('honey.repeat_expense')::uuid) then raise exception 'FAIL: partial expense saved'; end if;
  s := public.save_and_repeat_expense('expenses',null,null,current_setting('honey.repeat_expense')::uuid,current_setting('honey.repeat_values')::jsonb,current_setting('honey.repeat_schedule')::jsonb);
  if (select source_id from public.recurring_expenses where id=s) is distinct from current_setting('honey.repeat_expense')::uuid then raise exception 'FAIL: source link'; end if;
  if (select count(*) from public.expenses where id=current_setting('honey.repeat_expense')::uuid) <> 1 then raise exception 'FAIL: original count'; end if;
  begin
    perform public.save_and_repeat_expense('expenses',null,null,current_setting('honey.repeat_expense')::uuid,current_setting('honey.repeat_values')::jsonb,current_setting('honey.repeat_schedule')::jsonb);
    raise exception 'FAIL: retry created a duplicate';
  exception when unique_violation then null; end;
  begin
    perform public.save_and_repeat_expense('expenses',current_setting('honey.repeat_expense')::uuid,1,null,current_setting('honey.repeat_values')::jsonb,current_setting('honey.repeat_schedule')::jsonb);
    raise exception 'FAIL: second conversion allowed';
  exception when raise_exception then if sqlerrm <> 'This entry already has a recurring schedule.' then raise; end if; end;
  if (select version from public.expenses where id=current_setting('honey.repeat_expense')::uuid) <> 1 then raise exception 'FAIL: failed conversion edited original'; end if;
  -- Convert a separate existing entry: edit and schedule in one transaction.
  test_id := gen_random_uuid();
  insert into public.expenses(expense_date,description,amount_cents,paid_by,kirk_share_cents) values('2000-01-01','Synthetic existing',100,'jenny',50) returning id into test_id;
  perform public.save_and_repeat_expense('expenses',test_id,1,null,current_setting('honey.repeat_values')::jsonb,current_setting('honey.repeat_schedule')::jsonb);
  if (select version from public.expenses where id=test_id) <> 2 then raise exception 'FAIL: existing entry not edited'; end if;
end $$;
reset role;
-- Imported history conversion keeps the provided original balance change intact.
select set_config('honey.repeat_history',gen_random_uuid()::text,true);
insert into public.splitwise_batches(expected_balance_cents,row_count,created_by)
select 0,1,current_setting('honey.repeat_member')::uuid where not exists(select 1 from public.splitwise_batches);
insert into public.splitwise_history(id,batch_id,source_row,expense_date,description,category,currency,cost_cents,kirk_delta_cents,jenny_delta_cents,kind)
select current_setting('honey.repeat_history')::uuid,b.id,coalesce((select max(source_row) from public.splitwise_history where batch_id=b.id),0)+1,
 '2000-01-01','Synthetic imported','General','USD',100,20,-20,'expense' from public.splitwise_batches b;
set local role authenticated;
select public.save_and_repeat_expense('splitwise_history',current_setting('honey.repeat_history')::uuid,1,null,
 '{"expense_date":"2000-01-01","description":"Synthetic imported","category":"General","cost_cents":100,"kirk_delta_cents":20}'::jsonb,current_setting('honey.repeat_schedule')::jsonb);
do $$ begin
  if (select kirk_delta_cents from public.splitwise_history where id=current_setting('honey.repeat_history')::uuid) <> 20 then raise exception 'FAIL: imported balance changed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true);
set local role authenticated;
do $$ begin
  begin
    perform public.save_and_repeat_expense('expenses',null,null,gen_random_uuid(),current_setting('honey.repeat_values')::jsonb,current_setting('honey.repeat_schedule')::jsonb);
    raise exception 'FAIL: outsider conversion';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: expense-to-recurring conversion, rollback, source links, and duplicate protection' as result;
rollback;
