# Honey Money

A private shared-expense app for Jenny and Kirk. GitHub Pages serves the static interface; Supabase Auth and Postgres Row Level Security protect the records.

App: https://kklausmeyer-gmail.github.io/honey-money/

**Current milestone:** the Splitwise import and search are live and confirmed working. Released November 19, 2026: recurring schedules with in-app due reminders and manual confirmation, editing/deleting native and imported expenses with change history, an iPhone Home Screen icon, 30-day remembered personal-device sessions, and assumed imported payer labels that preserve original balances. Kirk reports migration 06 and tests 07 passed on November 19, 2026; GitHub Pages deployment succeeded and the updated public assets were verified. User acceptance testing is next. Manual CSV backup is chosen but still pending.

## Start here

Follow [SETUP.md](./SETUP.md). All production database actions are performed by you. Never provide Codex with a database password, Supabase account login, secret/service-role key, user session token, or an authenticator code. Never sign in to the production app in an agent-controlled browser.

The code has no analytics, session recording, third-party fonts, or client-side expense logging. In the current release, the sign-in checkbox chooses persistent localStorage for personal devices or sessionStorage for shared devices. Only authentication credentials persist; expense responses stay in memory. Signing out clears this device's credentials and app state. The previous 15-minute inactivity sign-out is removed. The database requires a signed TOTP verification within the last 30 days; refreshing tokens does not extend that window. Explicit sign-out still requires password and MFA on the next login. Browser storage restrictions or Supabase session revocation can require earlier sign-in.

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
- In the current release, both members can edit or soft-delete native and imported entries through version-checked functions. Direct update/delete privileges remain blocked; previous values are retained in `expense_changes`. The ledger excludes soft-deleted records. Clients cannot forge versions, deletion flags, or recurring occurrence identifiers.
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

As of November 18, 2026, both accounts work, password reset works, the owner reports passing database and import access tests, and the Splitwise import and search work on the live site. The chosen backup approach is [manual CSV export through the Supabase dashboard](./SETUP.md#simple-manual-expense-backups-chosen-approach); Kirk plans to run it soon and retains the original Splitwise export. See [saved progress and next priorities](./SETUP.md#progress-saved-november-19-2026) when resuming. Do not rerun the one-time import.

Keep the full CSV private and untracked. Do not upload it here. The browser importer previews all rows, preserves original balance deltas, treats the `Payment` category as settlements, skips empty rows, and requires the current Splitwise group balance to match before committing one atomic batch. Database rules enforce household membership and MFA, prevent a second import (even with a different file), and require an empty initial ledger. Unsupported currencies, invalid amounts/dates, and summary/footer records block the import instead of being silently dropped. The current release follows Kirk’s requested display assumption: a positive balance change implies Kirk paid, and a negative change implies Jenny paid (reversed for refunds). These labels say “assumed”; settlements and zero changes do not infer a payer. Original balance deltas remain authoritative; no 50/50 split or balance recalculation is introduced. Do not import the CSV into `expenses` directly: that table currently expects explicit payer/share fields that the sample does not fully provide.

Import preparation and owner-run steps are in [SETUP.md](./SETUP.md#8-import-splitwise-history). The importer reads the file locally for preview; only confirmation sends validated records to Supabase. No original file, filename, or records are logged or stored offline. Imported history is kept separately from new expense entries. Both support audited edits and soft deletion, and both contribute to the balance.

## November 19 release

Run [migration 06](./supabase/06-expense-management.sql), then [tests 07](./supabase/07-management-tests.sql), in separate Supabase SQL Editor queries. Tests use only synthetic records and roll back; they can run with imported production history present. Do not rerun the old empty-ledger import tests or the one-time import. Kirk confirmed both queries passed on November 19, 2026. Release commit `7d11250` deployed successfully through GitHub Pages; the updated app bundle and Apple touch icon (HTTP 200) were verified publicly. Kirk will test the live features; these user checks are not yet reported complete.

- **Recurring expenses:** weekly, monthly, quarterly, or yearly schedules; due reminders are inside the app, with Review & Add and Skip. Nothing posts automatically. Dates use America/Los_Angeles. Month-end schedules retain the original anchor, including leap years. Pause/Resume manages reminders; to change a schedule's amount/cadence, pause it and create a replacement. Editing/deleting an occurrence does not change the schedule. No email or push reminder service is configured.
- **Editing and deleting:** both members can edit native or imported entries and confirm deletion. Concurrent stale edits are rejected. Deleted entries disappear from the balance but remain recoverable in the database with their audit trail. Imported cost and balance effect can be edited independently; payer labels are assumptions, not replacement accounting data.
- **iPhone icon:** existing honey/heart design supplied as 180px Apple touch icon and 192/512px manifest icons; no offline caching of private data. Open in Safari, Share → Add to Home Screen. Remove and re-add an old shortcut if iOS caches its icon. Actual iPhone verification is pending.
- **30-day personal-device sign-in:** leave the personal-device checkbox selected to stay signed in across browser restarts. Uncheck on shared devices. MFA remains required for new sign-ins; the signed MFA timestamp is limited to 30 days in database access rules. Persistent authentication is not a promise that clearing browser storage or session revocation will preserve access.

Validation: `npm test`, `npm run build`, and isolated mobile browser checks using only fabricated records and intercepted Supabase requests. Run the optional smoke check after a build with `node scripts/smoke-ui.mjs ABSOLUTE_PLAYWRIGHT_PACKAGE_PATH [CHROME_EXECUTABLE_PATH]` (Playwright may come from the desktop bundled runtime). The test never opens a signed-in user browser.

The manual backup remains pending. With editing enabled, export `expenses`, `splitwise_history`, `splitwise_batches`, `recurring_expenses`, and `expense_changes` each time; imported history is no longer immutable. The original Splitwise export does not cover edits or later Honey Money entries. Production data remains owner-operated and private.

## Next session: user testing

Kirk plans to test the November 19 update. Await results before marking these checks complete:

- Refresh and verify the imported balance is unchanged; imported payer labels say assumed and Payment entries remain settlements.
- Create a test expense, edit it, verify the balance changes, then delete it and verify it disappears from the ledger/balance.
- Create a recurring schedule; verify Review & Add posts one occurrence, Skip posts none, and Pause/Resume behaves as expected. Check both devices after refreshing.
- Sign out and back in once on each personal device with Keep me signed in selected. Close/reopen and confirm sign-in persists. Confirm explicit sign-out still clears access. The actual 30-day expiry has not been observed over elapsed time; automated checks cover its logic.
- Add the app from iPhone Safari to the Home Screen and verify its icon and launch behavior. Re-add an old shortcut if needed.

Kirk’s initial iPhone testing reported excess zoom/missing margins on launch and background-page scrolling while editing. A follow-up with mobile layout/scroll fixes and expense-to-recurring conversion is prepared; see below. Manual CSV backup remains deferred by Kirk; instructions are retained in SETUP.md.

## iPhone testing follow-up — release follow-up

Kirk requested fixes for launch zoom/margins and the expense list scrolling behind edit dialogs, plus a Make this a recurring expense checkbox at the bottom of expense forms.

- Mobile inputs/selects/textareas use 16px text, flexible grid tracks allow date fields to shrink, and the page/dialog fit narrow viewports without disabling pinch zoom.
- All dialogs lock the underlying page at its existing scroll position, scroll their own content, and restore the original position on close/cancel or release the lock when auth routing replaces the dialog.
- New and edited expenses have an optional Make this a recurring expense checkbox with weekly/monthly/quarterly/yearly interval and first reminder date. The existing expense is saved once; future occurrences remain confirm-before-add.
- Imported entries additionally ask for the future amount, payer, and Kirk's share, prefilled from the agreed payer assumption and original balance effect where possible. Original imported accounting is saved as edited; future schedule values do not recalculate it.
- Saving the expense and creating its schedule are one transaction. Linked sources cannot be converted twice, and a stable new-expense ID prevents duplicate originals on retries. Existing recurring occurrences direct the user to manage their schedule instead of creating another one.

**Owner setup required before publication:** run `supabase/08-repeat-from-expense.sql`, then `supabase/09-repeat-from-expense-tests.sql` in separate SQL Editor queries. Tests use synthetic records and roll back, including on a populated ledger. Expect `PASS: expense-to-recurring conversion, rollback, source links, and duplicate protection`. These are additive changes; no real expense values are rewritten by migration 08.

Validation: 11 automated tests, production build, and isolated mobile browser checks of widths 320/375/390/430, form text size, dialog scroll locking/restoration, and new/imported conversion. Actual iPhone zoom/touch behavior still needs Kirk's retest after publication. No production signed-in browser or live records were accessed.

### Reminder to-do indicator and imported payer clarity

Also requested during iPhone testing: an unobtrusive To do section near the top with a red count, and clarification of payer labels on the existing Splitwise import. Included in the approved follow-up:

- A compact To do bar immediately below the greeting and above the balance. The red badge counts all due recurring occurrences, including missed cycles; paused/future schedules do not count. Zero due items show All caught up without a red badge. Tap to expand/collapse; this never blocks Add an expense or the ledger.
- Review & Add posts one due occurrence; Skip advances one occurrence without posting. The count updates after each action. Dates use Pacific time. Reminders remain in-app only; no email/push service is configured. The expanded/collapsed choice persists through ordinary page refresh actions within the current app session.
- The earlier deployed source showed both a small assumed-payer sentence and a prominent Toward label. The pending version puts Kirk paid (assumed) or Jenny paid (assumed) directly below the amount, and describes the balance effect separately. This rendering applies to existing imported rows; no new import or database rewrite is needed. Settlements and zero-effect rows still do not infer a payer.

Validation now includes 12 automated tests plus isolated mobile UI checks for the default collapsed to-do section, positive badge, expansion, and existing-history assumed payer labels. Kirk reports migrations/tests 08 and 09 passed; these reminder/label UI changes require no additional migration beyond that pending rollout.

## Approved follow-up rollout — November 19, 2026

Kirk confirmed SQL migration 08 and tests 09 completed successfully and approved shipping the iPhone layout fixes, modal scroll locking, make-recurring checkbox, compact red-count To do bar, and prominent assumed payer labels. The expense-to-recurring changes save the original once and create its future schedule atomically. These changes require no more owner SQL setup.

Kirk also requested a more practical expense-splitting tone while keeping the existing colors. Copy now uses direct labels such as Sign in, Current balance, Expenses, and Save expense. Romantic taglines, hearts, and bunny artwork are removed from the interface; headings use a more restrained sans-serif style. The brand/Home Screen icon is a dollar sign in a honey pot, using the existing green, cream, and honey palette. Apple touch and manifest icon URLs include a new revision to reduce stale icon caching. Existing iPhone shortcuts may still need to be removed and re-added in Safari.

Validation: all 12 automated tests, production build, and isolated mobile UI checks passed. No private expense records or signed-in user browser were accessed. Deployment proceeds through the existing GitHub Pages workflow. The next user check is to refresh/relaunch on iPhone and retest margins/zoom, modal scrolling, the recurring checkbox, to-do count, existing imported payer wording, and the new icon. Actual iPhone acceptance testing for this follow-up remains pending; the manual CSV backup also remains deferred.
