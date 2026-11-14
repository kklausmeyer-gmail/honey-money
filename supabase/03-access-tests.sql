-- Run as the project owner in SQL Editor AFTER both members are provisioned.
-- Tests use one synthetic record and roll back. Never disable RLS to make tests pass.
begin;
do $$ begin
  if (select count(*) from app_private.members) <> 2 then
    raise exception 'Provision both household members before running access tests.';
  end if;
end $$;
select set_config('honey.test_kirk', (select user_id::text from app_private.members where person = 'kirk'), true);
select set_config('honey.test_jenny', (select user_id::text from app_private.members where person = 'jenny'), true);
select set_config('honey.test_row', gen_random_uuid()::text, true);
insert into public.expenses (id, expense_date, description, amount_cents, paid_by, kirk_share_cents, created_by)
values (current_setting('honey.test_row')::uuid, '2000-01-01', 'Synthetic access check — rolled back', 101, 'kirk', 50, current_setting('honey.test_kirk')::uuid);

-- Anonymous callers cannot even SELECT the expense table.
set local role anon;
do $$ begin
  begin
    perform id from public.expenses;
    raise exception 'FAIL: anonymous SELECT was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Member without MFA: no reads and no inserts.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('honey.test_kirk'), 'aal', 'aal1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.expenses) then raise exception 'FAIL: aal1 read allowed'; end if;
  if public.my_membership() <> 'kirk' then raise exception 'FAIL: membership lookup'; end if;
  begin
    insert into public.expenses (expense_date, description, amount_cents, paid_by, kirk_share_cents)
      values ('2000-01-01', 'Must be rejected', 100, 'kirk', 50);
    raise exception 'FAIL: aal1 insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Unrelated signed-in user, even with MFA: no records, no membership, no insert.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'aal', 'aal2', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.expenses) then raise exception 'FAIL: outsider read allowed'; end if;
  if public.my_membership() is not null then raise exception 'FAIL: outsider membership'; end if;
  begin
    insert into public.expenses (expense_date, description, amount_cents, paid_by, kirk_share_cents)
      values ('2000-01-01', 'Must be rejected', 100, 'kirk', 50);
    raise exception 'FAIL: outsider insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Verified Kirk can read and add, but cannot forge Jenny's creator or change membership.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('honey.test_kirk'), 'aal', 'aal2', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.expenses where id = current_setting('honey.test_row')::uuid) then
    raise exception 'FAIL: verified Kirk cannot read';
  end if;
  insert into public.expenses (expense_date, description, amount_cents, paid_by, kirk_share_cents)
    values ('2000-01-01', 'Synthetic verified Kirk entry', 100, 'jenny', 100);
  begin
    insert into public.expenses (expense_date, description, amount_cents, paid_by, kirk_share_cents, created_by)
      values ('2000-01-01', 'Forged creator', 100, 'kirk', 50, current_setting('honey.test_jenny')::uuid);
    raise exception 'FAIL: forged creator allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update app_private.members set person = 'jenny' where person = 'kirk';
    raise exception 'FAIL: membership modification allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.expenses set description = 'Unauthorized edit';
    raise exception 'FAIL: update allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.expenses;
    raise exception 'FAIL: delete allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Verified Jenny sees the same synthetic shared record and can add an expense.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('honey.test_jenny'), 'aal', 'aal2', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.my_membership() <> 'jenny' then raise exception 'FAIL: Jenny membership'; end if;
  if not exists(select 1 from public.expenses where id = current_setting('honey.test_row')::uuid) then
    raise exception 'FAIL: verified Jenny cannot read';
  end if;
  insert into public.expenses (expense_date, description, amount_cents, paid_by, kirk_share_cents)
    values ('2000-01-01', 'Synthetic verified Jenny entry', 101, 'jenny', 50);
end $$;
reset role;
rollback;
select 'PASS: anonymous, outsider, MFA, household sharing, creator, and write restrictions. All test records rolled back.' as result;
