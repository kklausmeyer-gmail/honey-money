-- Run AFTER creating both users in Authentication > Users.
-- Replace both UUID placeholders yourself. Do not send passwords or UUIDs to Codex.
-- Exactly one account per person. Fails atomically if placeholders remain.
begin;
insert into app_private.members (user_id, person) values
  ('REPLACE_WITH_KIRK_AUTH_USER_UUID'::uuid, 'kirk'),
  ('REPLACE_WITH_JENNY_AUTH_USER_UUID'::uuid, 'jenny');
commit;
