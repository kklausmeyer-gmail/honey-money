# Honey Money: set up your two accounts

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

- Set **Site URL** to the exact published Pages URL, including the repository path and trailing slash.
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

## Recovery if an authenticator is lost

Use a private authenticator backup first. If unavailable, the Supabase project owner must verify the person and remove the lost MFA factor in the Auth dashboard or through Supabase's documented admin flow. The next sign-in must enroll and verify a new factor; no expense access is allowed at `aal1`. Keep your owner account recovery separate from the app accounts. Do not temporarily disable the expense policies to recover access.
