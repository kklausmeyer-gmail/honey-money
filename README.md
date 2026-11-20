# Honey Money

A private shared-expense app for Jenny and Kirk. GitHub Pages serves the static interface; Supabase Auth and Postgres Row Level Security protect the records.

App: https://kklausmeyer-gmail.github.io/honey-money/

**Current milestone:** the Splitwise import and search are live and confirmed working. Prepared November 19, 2026 in source: recurring schedules with in-app due reminders and manual confirmation, editing/deleting native and imported expenses with change history, an iPhone Home Screen icon, 30-day remembered personal-device sessions, and assumed imported payer labels that preserve original balances. Kirk reports migration 06 and tests 07 passed on November 19, 2026; deployment uses the existing GitHub Pages workflow. Manual CSV backup is chosen but still pending.

## Start here

Follow [SETUP.md](./SETUP.md). All production database actions are performed by you. Never provide Codex with a database password, Supabase account login, secret/service-role key, user session token, or an authenticator code. Never sign in to the production app in an agent-controlled browser.

The code has no analytics, session recording, third-party fonts, or client-side expense logging. For the prepared release, the sign-in checkbox chooses persistent localStorage for personal devices or sessionStorage for shared devices. Only authentication credentials persist; expense responses stay in memory. Signing out clears this device's credentials and app state. The previous 15-minute inactivity sign-out is removed. The database requires a signed TOTP verification within the last 30 days; refreshing tokens does not extend that window. Explicit sign-out still requires password and MFA on the next login. Browser storage restrictions or Supabase session revocation can require earlier sign-in.

## Local development

Requires Node 22 or newer.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Set only the public project URL and publishable key in .env.local.
npm.cmd run dev
```

The current workspace already contains ignored local public configuration. Do not overwrite it unless changing projects. Open the printed local URL in your own browser. Register that exact URL in Supabase's allowed authentication redirects before using reset emails locally.

```powershell
npm.cmd test
npm.cmd run build
```

Only `dist/` is deployed. Keep `data/` and `.env*` out of Git. Do not upload the entire workspace as a Pages artifact.

## Security boundaries

- An anonymous user has no expense-table privileges.
- A signed-in outsider, or a household member without MFA, cannot read or insert expenses.
- Only the owner can modify the two-user membership table. It is in a schema that must not be added to the exposed API schemas.
- The membership RPC reveals only the caller's own person label. It grants no record access.
- In the prepared release, both members can edit or soft-delete native and imported entries through version-checked functions. Direct update/delete privileges remain blocked; previous values are retained in `expense_changes`. The ledger excludes soft-deleted records. Clients cannot forge versions, deletion flags, or recurring occurrence identifiers.
- Both members can see all household expenses. The database owner and hosting provider remain trusted administrators; this is not end-to-end encryption.
- The frontend key is intentionally public. It is not an authorization secret. RLS must remain enabled.
- GitHub Pages generally publishes the app interface publicly; Supabase protects the data. A private Git repository does not itself make the site private.
- Dependencies are bundled at build time. No script CDN is used. A CSP meta tag restricts resources; GitHub Pages does not offer arbitrary response headers, so this does not include a header-based frame-ancestors policy.
- Auth email links use Supabase's implicit browser flow. Tokens are consumed by the SDK and stored according to the personal/shared-device choice; the referrer policy prevents onward referrer disclosure. Use your own trusted browser and close it when finished.

## Files

- `supabase/01-schema.sql`: tables, constraints, minimal privileges, MFA and membership policies.
- `supabase/02-members.sql`: owner-run template for the two existing Auth user IDs.
- `supabase/03-access-tests.sql`: rollback-only synthetic access tests. Run yourself.
- `.github/workflows/pages.yml`: test, build and publish to GitHub Pages.
- `scripts/github-pages.mjs`: optional owner-run Pages enablement/deployment helper; uses existing Git authentication without saving credentials.
- `src/`: browser application. Uses no privileged database credential.

## Splitwise import

As of November 18, 2026, both accounts work, password reset works, the owner reports passing database and import access tests, and the Splitwise import and search work on the live site. The chosen backup approach is [manual CSV export through the Supabase dashboard](./SETUP.md#simple-manual-expense-backups-chosen-approach); Kirk plans to run it soon and retains the original Splitwise export. See [saved progress and next priorities](./SETUP.md#progress-saved-november-18-2026) when resuming. Do not rerun the one-time import.

Keep the full CSV private and untracked. Do not upload it here. The browser importer previews all rows, preserves original balance deltas, treats the `Payment` category as settlements, skips empty rows, and requires the current Splitwise group balance to match before committing one atomic batch. Database rules enforce household membership and MFA, prevent a second import (even with a different file), and require an empty initial ledger. Unsupported currencies, invalid amounts/dates, and summary/footer records block the import instead of being silently dropped. The prepared release follows Kirk’s requested display assumption: a positive balance change implies Kirk paid, and a negative change implies Jenny paid (reversed for refunds). These labels say “assumed”; settlements and zero changes do not infer a payer. Original balance deltas remain authoritative; no 50/50 split or balance recalculation is introduced. Do not import the CSV into `expenses` directly: that table currently expects explicit payer/share fields that the sample does not fully provide.

Import preparation and owner-run steps are in [SETUP.md](./SETUP.md#8-import-splitwise-history). The importer reads the file locally for preview; only confirmation sends validated records to Supabase. No original file, filename, or records are logged or stored offline. Imported history is kept separately from new expense entries; the prepared release allows audited edits and soft deletion of both; both contribute to the balance.

## November 19 release

Run [migration 06](./supabase/06-expense-management.sql), then [tests 07](./supabase/07-management-tests.sql), in separate Supabase SQL Editor queries. Tests use only synthetic records and roll back; they can run with imported production history present. Do not rerun the old empty-ledger import tests or the one-time import. Kirk confirmed both queries passed on November 19, 2026, authorizing publication of the updated app.

- **Recurring expenses:** weekly, monthly, quarterly, or yearly schedules; due reminders are inside the app, with Review & Add and Skip. Nothing posts automatically. Dates use America/Los_Angeles. Month-end schedules retain the original anchor, including leap years. Pause/Resume manages reminders; to change a schedule's amount/cadence, pause it and create a replacement. Editing/deleting an occurrence does not change the schedule. No email or push reminder service is configured.
- **Editing and deleting:** both members can edit native or imported entries and confirm deletion. Concurrent stale edits are rejected. Deleted entries disappear from the balance but remain recoverable in the database with their audit trail. Imported cost and balance effect can be edited independently; payer labels are assumptions, not replacement accounting data.
- **iPhone icon:** existing honey/heart design supplied as 180px Apple touch icon and 192/512px manifest icons; no offline caching of private data. After publication, open in Safari, Share → Add to Home Screen. Remove and re-add an old shortcut if iOS caches its icon. Actual iPhone verification is pending.
- **30-day personal-device sign-in:** leave the personal-device checkbox selected to stay signed in across browser restarts. Uncheck on shared devices. MFA remains required for new sign-ins; the signed MFA timestamp is limited to 30 days in database access rules. Persistent authentication is not a promise that clearing browser storage or session revocation will preserve access.

Validation: `npm test`, `npm run build`, and isolated mobile browser checks using only fabricated records and intercepted Supabase requests. Run the optional smoke check after a build with `node scripts/smoke-ui.mjs ABSOLUTE_PLAYWRIGHT_PACKAGE_PATH [CHROME_EXECUTABLE_PATH]` (Playwright may come from the desktop bundled runtime). The test never opens a signed-in user browser.

The manual backup remains pending. With editing enabled, export `expenses`, `splitwise_history`, `splitwise_batches`, `recurring_expenses`, and `expense_changes` each time; imported history is no longer immutable. The original Splitwise export does not cover edits or later Honey Money entries. Production data remains owner-operated and private.
