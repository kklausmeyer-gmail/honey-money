-- Owner-run after migration 06. Uses synthetic records only; rolls back every change.
-- Safe on a populated ledger: no real expense is edited or removed.
begin;
select set_config('honey.test_member', (select user_id::text from app_private.members where person='kirk'), true);
select set_config('honey.test_other', (select user_id::text from app_private.members where person='jenny'), true);
select set_config('honey.test_expense', gen_random_uuid()::text, true);
select set_config('honey.test_history', gen_random_uuid()::text, true);
do $$ begin
  if nullif(current_setting('honey.test_member'),'') is null or nullif(current_setting('honey.test_other'),'') is null then raise exception 'Provision both members first.'; end if;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('honey.test_member'),'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true);
insert into public.expenses(id,expense_date,description,amount_cents,paid_by,kirk_share_cents,created_by)
values(current_setting('honey.test_expense')::uuid,'2000-01-01','Synthetic management test',100,'kirk',50,current_setting('honey.test_member')::uuid);
-- Reuse only a batch reference if real history exists; add a new synthetic row, never touch real rows.
insert into public.splitwise_batches(expected_balance_cents,row_count,created_by)
select 0,1,current_setting('honey.test_member')::uuid where not exists(select 1 from public.splitwise_batches);
insert into public.splitwise_history(id,batch_id,source_row,expense_date,description,category,currency,cost_cents,kirk_delta_cents,jenny_delta_cents,kind)
select current_setting('honey.test_history')::uuid,b.id,coalesce((select max(source_row) from public.splitwise_history where batch_id=b.id),0)+1,
 '2000-01-01','Synthetic history test','General','USD',100,50,-50,'expense' from public.splitwise_batches b;

set local role authenticated;
do $$ declare r uuid; v integer; begin
  if not public.household_access() then raise exception 'FAIL: current MFA rejected'; end if;
  perform public.change_expense('expenses',current_setting('honey.test_expense')::uuid,1,'edit',
    '{"expense_date":"2000-01-02","description":"Synthetic edited","amount_cents":200,"paid_by":"jenny","kirk_share_cents":75,"category":"General","notes":"test","tags":["test"]}'::jsonb);
  if (select amount_cents from public.expenses where id=current_setting('honey.test_expense')::uuid) <> 200 then raise exception 'FAIL: edit not saved'; end if;
  begin
    perform public.change_expense('expenses',current_setting('honey.test_expense')::uuid,1,'delete');
    raise exception 'FAIL: stale version allowed';
  exception when serialization_failure then null; end;
  perform public.change_expense('expenses',current_setting('honey.test_expense')::uuid,2,'delete');
  if (select deleted_at is null from public.expenses where id=current_setting('honey.test_expense')::uuid) then raise exception 'FAIL: delete did not mark record'; end if;
  perform public.change_expense('expenses',current_setting('honey.test_expense')::uuid,3,'restore');
  if (select count(*) from public.expense_changes where record_id=current_setting('honey.test_expense')::uuid) <> 3 then raise exception 'FAIL: missing audit history'; end if;
  begin
    update public.expenses set amount_cents=1 where id=current_setting('honey.test_expense')::uuid;
    raise exception 'FAIL: direct update allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.expenses(expense_date,description,amount_cents,paid_by,kirk_share_cents,deleted_at)
      values('2000-01-01','Forged',100,'kirk',50,now());
    raise exception 'FAIL: forged metadata allowed';
  exception when insufficient_privilege then null; end;
  perform public.change_expense('splitwise_history',current_setting('honey.test_history')::uuid,1,'edit',
    '{"expense_date":"2000-01-02","description":"Synthetic history edited","category":"General","cost_cents":200,"kirk_delta_cents":-75}'::jsonb);
  if (select kirk_delta_cents+jenny_delta_cents from public.splitwise_history where id=current_setting('honey.test_history')::uuid) <> 0 then raise exception 'FAIL: history balance not conserved'; end if;
  begin
    perform public.change_expense('splitwise_history',current_setting('honey.test_history')::uuid,2,'edit',
      '{"expense_date":"2000-01-02","description":"Invalid","category":"General","cost_cents":100,"kirk_delta_cents":101}'::jsonb);
    raise exception 'FAIL: invalid delta allowed';
  exception when check_violation then null; end;
  perform public.change_expense('splitwise_history',current_setting('honey.test_history')::uuid,2,'delete');
  perform public.change_expense('splitwise_history',current_setting('honey.test_history')::uuid,3,'restore');
  r := public.save_recurring(null,null,'{"description":"Synthetic monthly","amount_cents":101,"paid_by":"kirk","kirk_share_cents":50,"category":"General","frequency":"monthly","anchor_date":"2000-01-31"}'::jsonb);
  perform public.confirm_recurring(r,1,false);
  if (select next_due from public.recurring_expenses where id=r) <> '2000-02-29'::date then raise exception 'FAIL: month end/leap date'; end if;
  begin
    perform public.confirm_recurring(r,1,false);
    raise exception 'FAIL: duplicate occurrence allowed';
  exception when serialization_failure then null; end;
  if (select count(*) from public.expenses where recurring_id=r) <> 1 then raise exception 'FAIL: duplicate entry'; end if;
  perform public.confirm_recurring(r,2,true);
  if (select next_due from public.recurring_expenses where id=r) <> '2000-03-31'::date then raise exception 'FAIL: monthly anchor drift'; end if;
  if (select count(*) from public.expenses where recurring_id=r) <> 1 then raise exception 'FAIL: skip created entry'; end if;
  perform public.save_recurring(r,3,'{"active":false}'::jsonb);
  begin
    perform public.confirm_recurring(r,4,false);
    raise exception 'FAIL: paused occurrence allowed';
  exception when raise_exception then if sqlerrm <> 'This expense is not due.' then raise; end if; end;
  r := public.save_recurring(null,null,jsonb_build_object('description','Synthetic future','amount_cents',100,'paid_by','jenny','kirk_share_cents',50,'frequency','weekly','anchor_date',(now() at time zone 'America/Los_Angeles')::date+10));
  begin
    perform public.confirm_recurring(r,1,false);
    raise exception 'FAIL: future occurrence allowed';
  exception when raise_exception then if sqlerrm <> 'This expense is not due.' then raise; end if; end;
end $$;
reset role;

-- Both household members can manage records, with a fresh version.
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('honey.test_other'),'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true);
set local role authenticated;
select public.change_expense('expenses',current_setting('honey.test_expense')::uuid,4,'delete');
reset role;

-- Refreshing a token does not make 31-day-old MFA current.
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('honey.test_member'),'aal','aal2','iat',extract(epoch from now()),'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()-interval '31 days')))))::text,true);
set local role authenticated;
do $$ begin
  if public.household_access() or exists(select 1 from public.expenses) or exists(select 1 from public.splitwise_history) or exists(select 1 from public.recurring_expenses) or exists(select 1 from public.expense_changes) then raise exception 'FAIL: stale MFA access'; end if;
  begin
    perform public.change_expense('expenses',current_setting('honey.test_expense')::uuid,5,'restore');
    raise exception 'FAIL: stale MFA write';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub',gen_random_uuid(),'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true);
set local role authenticated;
do $$ begin
  if public.household_access() or exists(select 1 from public.expense_changes) then raise exception 'FAIL: outsider read'; end if;
  begin
    perform public.save_recurring(null,null,'{}'::jsonb);
    raise exception 'FAIL: outsider schedule';
  exception when insufficient_privilege then null; end;
  begin
    perform public.confirm_recurring(gen_random_uuid(),1,false);
    raise exception 'FAIL: outsider confirm';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('honey.test_member'),'aal','aal1')::text,true);
set local role authenticated;
do $$ begin
  if public.household_access() then raise exception 'FAIL: aal1 access'; end if;
  begin
    perform public.change_expense('expenses',current_setting('honey.test_expense')::uuid,5,'restore');
    raise exception 'FAIL: aal1 edit';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.change_expense('expenses',current_setting('honey.test_expense')::uuid,5,'restore');
    raise exception 'FAIL: anonymous edit';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: editing, deletion, audit, recurring dates, duplicate protection, and MFA freshness' as result;
rollback;
