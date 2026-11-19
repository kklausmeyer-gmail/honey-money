import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('production SQL denies outsiders and non-MFA members using an isolated local database', async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase Auth contract; all identities here are fabricated.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222');
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as
        $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
    `);
    const schema = await readFile(new URL('../supabase/01-schema.sql', import.meta.url), 'utf8');
    await db.exec(schema);
    await db.exec(schema); // Safe re-application must preserve deny-by-default policies.
    await db.exec(`insert into app_private.members values
      ('11111111-1111-4111-8111-111111111111', 'kirk'),
      ('22222222-2222-4222-8222-222222222222', 'jenny');`);
    const result = await db.exec(await readFile(new URL('../supabase/03-access-tests.sql', import.meta.url), 'utf8'));
    assert.match(result.at(-1).rows[0].result, /^PASS:/);
    assert.equal((await db.query('select count(*)::int as count from public.expenses')).rows[0].count, 0);
    assert.equal((await db.query('select count(*)::int as count from app_private.members')).rows[0].count, 2);
    const migration = await readFile(new URL('../supabase/04-splitwise-import.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const importResult = await db.exec(await readFile(new URL('../supabase/05-import-access-tests.sql', import.meta.url), 'utf8'));
    assert.ok(importResult.some(r => r.rows?.some(row => /^PASS: import/.test(row.result || ''))));
    assert.equal((await db.query('select count(*)::int as count from public.splitwise_history')).rows[0].count, 0);
    assert.equal((await db.query('select count(*)::int as count from public.splitwise_batches')).rows[0].count, 0);
  } finally { await db.close(); }
});
