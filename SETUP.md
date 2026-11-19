# Honey Money: set up your two accounts

Your app URL is **https://kklausmeyer-gmail.github.io/honey-money/**. GitHub Pages is configured to deploy through Actions; the repository setup in step 4 has been completed. Continue with Supabase steps 1–3 and 5–7 yourself.

Run the Supabase steps yourself in your own browser. Codex does not need dashboard access, a database connection, or screenshots of account secrets. Do not send expense records, passwords, MFA QR codes, setup keys, or codes into chat.

## 1. Configure authentication

In your new Supabase project:

1. Under **Authentication → Sign In / Providers**, enable email/password sign-in. Disable anonymous sign-ins and any unused providers.
2. Under the authentication settings, turn **Allow new users to sign up** off. Create the two accounts administratively in the next step.
3. Set the password minimum to at least **14 characters**. Use unique passwords. Enable leaked-password protection if available on your plan.
4. Under **Authentication → Multi-Factor**, enable authenticator-app / TOTP enrollment. Keep this enabled; the database requires an `aal2` session.
5. Configure a production SMTP provider before relying on password-reset emails. Supabase's default email sender is restricted and is not a dependable way to deliver mail to arbitrary household addresses. You can complete first sign-in using passwords you set administratively, then test email delivery after configuring SMTP.
6. Protect your Supabase owner account and GitHub account with MFA too. Keep recovery credentials somewhere private.

Supabase dashboard labels may move. Official references: [Auth settings](https://supabase.com/docs/guides/auth/general-configuration), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [MFA](https://supabase.com/docs/guides/auth/auth-mfa).

## 2. Create Jenny's and Kirk's accounts

1. In **Authentication → Users**, choose **Add user → Create new user**.
2. Create Kirk's account using his email and a unique private password. Use the administrative auto-confirm email option after verifying the address yourself.
3. Repeat for Jenny. She should choose her password privately, or privately receive a temporary unique password and replace it before using real data.
4. Copy each user's UUID from this page into your own copy of `supabase/02-members.sql`, matching each person carefully. Do not use email addresses in place of UUIDs.

No sign-up form exists in the app. The two created user IDs are the access allowlist. Changing an account's email does not change its membership. If an account is deleted and recreated, the new ID needs to be provisioned again by you.

## 3. Install the database rules

1. Open **SQL Editor** in Supabase.
2. Paste and run all of `supabase/01-schema.sql`. It starts locked: no members have access yet.
3. Paste and run your edited `supabase/02-members.sql` with both user UUIDs replaced. This file is a one-time provisioning script. Do not run it repeatedly; duplicate users/person labels intentionally fail.
4. In API settings, keep `app_private` **out of Exposed schemas**. The app accesses only the intended public table and function.
5. Run `supabase/03-access-tests.sql`. It should return a successful result and rolls back every synthetic test record. A SQL error means you should fix setup before proceeding. Do not disable RLS to fix an error.

The access test simulates database roles/JWT claims as the owner. It verifies policy behavior; it does not replace testing real passwords, MFA, or email delivery.

## 4. Publish on GitHub Pages

1. Create a new GitHub repository named `honey-money`. A private repository is preferable if your GitHub plan supports Pages from it; the published interface will ordinarily still be public.
2. Push only the app's source files. **Never upload `data/`, `node_modules/`, `.env.local`, or the full workspace as a zip.** `.gitignore` already excludes them, but manual uploads can bypass that protection.
3. The deployment workflow already includes your personal project's public configuration. To change projects later, override these repository variables under **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_SUPABASE_URL`: your public project URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: your `sb_publishable_…` key.
4. Under **Settings → Pages**, choose **GitHub Actions** as the build source.
5. Push to `main`, or manually run **Deploy Honey Money** in Actions. Wait for the deployment job to complete and note the actual Pages URL. A typical project URL is `https://YOUR_GITHUB_NAME.github.io/honey-money/`.

No database secret is needed in GitHub Actions. If a key starts with `sb_secret_`, or is described as `service_role`, it must never be used here.

## 5. Set authentication URLs

In Supabase **Authentication → URL Configuration**:

- Set **Site URL** to `https://kklausmeyer-gmail.github.io/honey-money/`, including the repository path and trailing slash.
- Add that same exact URL to allowed **Redirect URLs**.
- If testing locally, also add the exact local URL printed by Vite, normally `http://127.0.0.1:5173/`. Do not use broad production wildcards. Remove the local redirect when you no longer need it.

Use [Supabase's URL configuration guide](https://supabase.com/docs/guides/auth/redirect-urls) if the dashboard warns about a mismatch.

## 6. Sign in separately on your own devices

1. Kirk opens Honey Money in his own browser and signs in with his email/password.
2. Choose **Set up authenticator**, scan the QR code with a trusted authenticator, and enter its six-digit code **in the app only**. Store an authenticator backup in your password manager.
3. The expense screen should say **Hey, Kirk** and show zero entries.
4. Jenny does the same on her own device. Her screen should say **Hey, Jenny** and show zero entries.
5. Sign out and sign back in. Both accounts should require a current authenticator code. Confirm both devices see the same empty household.
6. Use **Forgot your password?** to test delivery and the reset flow on your own device. An account with MFA still needs its authenticator before changing the password. Resetting a password does not bypass MFA.

Session tokens stay in the browser tab's session storage. Sessions normally do not survive closing the tab, but browser restore/duplicate-tab behavior may copy session storage. Use **Sign out** on a shared device. Signing out here signs out this session; it does not sign out Jenny's device.

## 7. Readiness gate before real data

- Both people can sign in, complete MFA, sign out, and sign back in.
- Both see their own correct greeting and the same empty expense list.
- Password-reset email delivery and the final password change work.
- Public signup and anonymous sign-in are disabled.
- `03-access-tests.sql` passes with RLS enabled.
- No third person is present in `app_private.members` (the constraints limit it to one Jenny and one Kirk).
- You have chosen an appropriate backup approach and understand your Supabase plan's restore options.

Once these pass, tell Codex only that account setup passed, or the non-sensitive error text if something failed. No screenshots, user IDs, tokens, or production records are needed. Do not import Splitwise yet; its importer will be a separate step.

## 8. Import Splitwise history

Prepared November 18, 2026. No production import has been performed. The expected export headers are `Date,Description,Category,Cost,Currency,Jenny,Kirk Klausmeyer`. The reported current group balance is **Kirk owes Jenny $751.59**; recheck it if anything changes before import.

1. In your own Supabase SQL Editor, open a fresh query and run all of `supabase/04-splitwise-import.sql`. This additive migration creates separate history/batch tables and an atomic import function. It does not change existing memberships or disable RLS.
2. In another query, run `supabase/05-import-access-tests.sql`. Expect `PASS: import access, balance validation, rollback, and repeat protection`. This uses synthetic records and rolls them back. It requires an empty ledger; stop on any error. If a query leaves the editor in an aborted transaction, run `ROLLBACK;` before trying again.
3. After these succeed, deploy the updated app source through GitHub Pages. The locally prepared importer is not available on the live site until deployed.
4. Open Honey Money in your own browser and complete MFA. Click **Import Splitwise history** and choose the original CSV. Keep the full file out of chat and GitHub.
5. Preview the count, all rows, settlements, and calculated balance. Enter the current group balance yourself (for the reported balance, choose **Kirk owes Jenny** and enter `751.59`). Do not confirm unless it matches Splitwise exactly. A mismatch, unsupported currency, or unexpected footer blocks the import; report non-sensitive error text for review rather than editing financial amounts to force it through.
6. Confirm only after reviewing the complete export. The database saves the entire batch or none of it. The importer is one-time and requires an empty ledger. If a network error leaves the result uncertain, close the dialog and refresh to check for history; do not manually insert rows or clear the batch.
7. Check the final balance on both devices, then follow the CSV backup routine below. Keep the original Splitwise export.

The export supplies each person's net balance change, not the original payer/share breakdown. Imported entries retain those changes and mark payer/split as unavailable. Payment rows remain settlements. The history is read-only; future expenses are saved separately and added to its balance.

## Simple manual expense backups (chosen approach)

Use the Supabase dashboard to save expense records as CSV. No Docker or command-line tools are needed.

1. Sign in to your Supabase project in your own browser and open **Table Editor**.
2. Select the **public** schema and the **expenses** table.
3. Clear filters and include all columns. Choose **Export / Export data → CSV** (labels may vary). If offered a choice, export all rows, rather than only selected rows or the current page.
4. Save as `expenses-YYYY-MM-DD.csv` in a private folder outside this Git repository, such as `Documents\Honey Money Backups\YYYY-MM-DD`.
5. Check privately that the file includes all columns and the expected number of records, especially when the table spans multiple pages. With an empty table, there are no expense records to back up yet.
6. Keep a second copy in private encrypted backup storage or on an encrypted external drive. Keep backups out of GitHub and chat.

Export immediately after the future Splitwise import, weekly afterward, and before bulk changes. Keep the latest eight weekly copies and the original Splitwise export. Weekly exports mean up to a week of new entries could be lost.

**After importing:** also export `public.splitwise_history` and `public.splitwise_batches` as CSV using the same steps. Keep these two files together with the first post-import backup and retain them permanently: imported history is separate from `expenses` and is read-only. Weekly backups of new entries can continue exporting `expenses`; keep the fixed history/batch copies alongside them. If the schema changes later, export all three tables again. Preserve original column names and IDs.

This preserves expense records, not the full Supabase project. It does not back up accounts, passwords, MFA, membership, database rules, or dashboard settings. Keep the project setup scripts and these instructions separately. Recovery may require recreating accounts and mapping old user IDs to replacement accounts before restoring records. Do not blindly import a backup into a populated table. Test recovery in a separate project before relying on this routine; downloading a CSV alone does not prove it can be restored.

## Progress saved: November 17, 2026

- Kirk reports successful sign-in on computer and phone, MFA checks, and password reset.
- Jenny's account works and shows **Hey, Jenny**.
- Kirk reports that `03-access-tests.sql` passes.
- Manual dashboard CSV export is the chosen backup approach. No completed backup or restore test has been reported.
- A fresh Splitwise export is ready and should remain private. **The Splitwise import has not started.** Resume by preparing the importer and its preview/reconciliation checks; do not import the Splitwise CSV directly into `expenses`.

## Recovery if an authenticator is lost

Use a private authenticator backup first. If unavailable, the Supabase project owner must verify the person and remove the lost MFA factor in the Auth dashboard or through Supabase's documented admin flow. The next sign-in must enroll and verify a new factor; no expense access is allowed at `aal1`. Keep your owner account recovery separate from the app accounts. Do not temporarily disable the expense policies to recover access.
