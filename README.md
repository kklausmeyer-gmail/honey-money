# Honey Money

A private shared-expense app for Jenny and Kirk. GitHub Pages serves the static interface; Supabase Auth and Postgres Row Level Security protect the records.

App: https://kklausmeyer-gmail.github.io/honey-money/

**Current milestone:** account setup, email/password sign-in and recovery, mandatory authenticator verification, two-person membership, expense entry, exact cent-based splitting, balance calculation, and searchable expenses. A preview-first, one-time Splitwise importer is prepared in source; install migration 04 and run import tests 05 before deploying and using it. Recurring reminders, settlements, editing/history, and exports are later milestones. Do not use the displayed balance as a replacement for your existing Splitwise balance yet.

## Start here

Follow [SETUP.md](./SETUP.md). All production database actions are performed by you. Never provide Codex with a database password, Supabase account login, secret/service-role key, user session token, or an authenticator code. Never sign in to the production app in an agent-controlled browser.

The code has no analytics, session recording, third-party fonts, or client-side expense logging. Sessions live in sessionStorage rather than localStorage. Expense responses stay in memory; they are not intentionally persisted offline. Signing out clears the app state, and inactivity signs out after 15 minutes while the page is running. This is not a server-enforced session lifetime or protection against a compromised device.

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
- Expenses are append-only in this milestone; clients cannot update, delete, or forge another creator.
- Both members can see all household expenses. The database owner and hosting provider remain trusted administrators; this is not end-to-end encryption.
- The frontend key is intentionally public. It is not an authorization secret. RLS must remain enabled.
- GitHub Pages generally publishes the app interface publicly; Supabase protects the data. A private Git repository does not itself make the site private.
- Dependencies are bundled at build time. No script CDN is used. A CSP meta tag restricts resources; GitHub Pages does not offer arbitrary response headers, so this does not include a header-based frame-ancestors policy.
- Auth email links use Supabase's implicit browser flow. Tokens are consumed by the SDK and stored only in the tab session; the referrer policy prevents onward referrer disclosure. Use your own trusted browser and close it when finished.

## Files

- `supabase/01-schema.sql`: tables, constraints, minimal privileges, MFA and membership policies.
- `supabase/02-members.sql`: owner-run template for the two existing Auth user IDs.
- `supabase/03-access-tests.sql`: rollback-only synthetic access tests. Run yourself.
- `.github/workflows/pages.yml`: test, build and publish to GitHub Pages.
- `scripts/github-pages.mjs`: optional owner-run Pages enablement/deployment helper; uses existing Git authentication without saving credentials.
- `src/`: browser application. Uses no privileged database credential.

## Splitwise import

As of November 17, 2026, both accounts work, password reset works, and the owner reports passing database access tests. The chosen backup approach is [manual CSV export through the Supabase dashboard](./SETUP.md#simple-manual-expense-backups-chosen-approach). A fresh Splitwise export is ready; no production import has been performed. See [saved progress](./SETUP.md#progress-saved-november-17-2026) when resuming.

Keep the full CSV private and untracked. Do not upload it here. The browser importer previews all rows, preserves original balance deltas, treats the `Payment` category as settlements, skips empty rows, and requires the current Splitwise group balance to match before committing one atomic batch. Database rules enforce household membership and MFA, prevent a second import (even with a different file), and require an empty initial ledger. Unsupported currencies, invalid amounts/dates, and summary/footer records block the import instead of being silently dropped. Historical payer/split information that cannot be inferred will remain unknown. Do not import the CSV into `expenses` directly: that table currently expects explicit payer/share fields that the sample does not fully provide.

Import preparation and owner-run steps are in [SETUP.md](./SETUP.md#8-import-splitwise-history). The importer reads the file locally for preview; only confirmation sends validated records to Supabase. No original file, filename, or records are logged or stored offline. Imported history is read-only and kept separately from new expense entries; both contribute to the balance.
