# Persist — sync setup (Supabase)

Persist works fully offline in the browser. Adding Supabase lets the same data sync between
your laptop and phone and survive clearing the browser. Without the two env vars below, the
app runs in **local-only mode** (the "Sign in to sync" pill is hidden) — nothing breaks.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a name (e.g. `persist`), a strong database password (store it in your password manager —
   the app never needs it) and the region closest to you (e.g. *Mumbai* / `ap-south-1`).
3. Wait for the project to finish provisioning.

## 2. Copy the URL and the anon (public) key

In the dashboard: **Project Settings → API** (newer dashboards: **Project Settings → Data API**
for the URL and **API Keys** for the key).

| Value | Where | Goes into |
| --- | --- | --- |
| Project URL — `https://<ref>.supabase.co` | API / Data API | `VITE_SUPABASE_URL` |
| `anon` `public` key (or the new **publishable** key, `sb_publishable_…`) | API / API Keys | `VITE_SUPABASE_ANON_KEY` |

Create `.env` in the project root (it is git-ignored):

```bash
cp .env.example .env
# then edit .env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key>
```

> **Never** use the `service_role` / secret key in this app, in `.env`, or on Vercel/Netlify.
> It bypasses Row Level Security. The anon key is safe to ship to the browser because every
> table is protected by RLS (each user can only read and write their own rows).

Restart `npm run dev` after changing `.env`.

## 3. Create the tables (run `001_init.sql`)

1. Dashboard → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) and click **Run**.
3. Check **Table Editor**: you should see `days`, `carried_items`, `topics_done`, `reviews`,
   `settings`, each marked **RLS enabled**.

The script is idempotent (safe to run again). If you use the Supabase CLI instead:
`supabase link --project-ref <ref>` then `supabase db push`.

## 4. Auth: magic links and redirect URLs

1. **Authentication → Sign In / Providers → Email**: make sure Email is enabled. Passwords aren't
   used; Persist signs in with a magic link (`signInWithOtp`). You can turn off "Confirm email"
   — a magic link already proves the address.
2. **Authentication → URL Configuration**:
   - **Site URL**: your deployed URL, e.g. `https://persist-yourname.vercel.app`
     (use `http://localhost:5173` until you deploy).
   - **Redirect URLs** — add all of:
     - `http://localhost:5173/**`
     - `https://persist-yourname.vercel.app/**` (your real deployed URL)
     - if you use the dev server on another port, that origin too, e.g. `http://localhost:5180/**`

   After you click the link in the email you land on `<origin>/app`, already signed in.
3. *(Recommended)* **Authentication → Emails → SMTP Settings**: Supabase's built-in mailer is
   rate-limited to a few emails per hour. Plug in any SMTP provider (Resend, Brevo, Gmail SMTP…)
   if you sign in often or on several devices.

Magic links use the implicit flow, so a link requested on the laptop can be opened on the
phone (that signs the phone in).

## 5. Deploy (Vercel or Netlify)

Both env vars are needed at **build time** (Vite inlines them).

**Vercel** → Project → **Settings → Environment Variables**: add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` for *Production* (and *Preview* if you want), then **Redeploy**.
`vercel.json` in the repo already rewrites every path to `index.html`, so `/app` links work.

**Netlify** → Site → **Site configuration → Environment variables**: add the same two keys,
then **Trigger deploy**. Build command `npm run build`, publish directory `dist`.
`public/_redirects` already provides the SPA fallback.

Then add the deployed origin to Supabase's Redirect URLs (step 4).

## 6. First sign-in

1. Open the app → **Today** → status strip → **Sign in to sync** → enter your email.
2. Open the link from the email.
3. On the first sign-in from each device, Persist:
   - saves a copy of your local data under the `prisma-backup-before-sync` localStorage key;
   - if your account is empty, uploads everything and shows *"Your local data is now synced"*;
   - if your account already has data, merges row by row — the newer `updated_at` wins and
     nothing is deleted on either side. Data saved before this version has no timestamp, so for
     a day that exists in both places the synced copy wins; days only on this device are uploaded.

Sign out from **Settings (gear) → Sign out**. Your data stays on the device.

## How sync works (for later reference)

- Every change is written to localStorage immediately and queued in a persistent outbox
  (`prisma-outbox-v1` — storage keys keep the original name so existing data loads). The outbox is flushed 1 s after the last change, one upsert per table,
  with exponential backoff (1 s → 60 s) on errors, and again on `online` / tab focus.
- Pulls run on load, on tab focus and every 60 s: rows with `updated_at` newer than the last pull
  (minus a 10 s overlap) are merged; newer wins.
- Deletes are soft: dropping a carried item sets `dropped = true`, so other devices see it.
- Carried items have deterministic ids (uuid v5 of user id + `<sourceDate>:<taskId>`), so two
  devices rolling over the same midnight write the same rows — no duplicates.
- Everything goes through `src/lib/storage/`. To move to another backend (e.g. Spring Boot),
  implement `RemoteBackend` (`src/lib/storage/types.ts`) and swap `createSupabaseBackend()` in
  `src/lib/storage/index.ts`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No "Sign in to sync" pill | Env vars missing or the dev server wasn't restarted after editing `.env`. |
| Email link opens but you're not signed in | The origin isn't in **Redirect URLs**, or the link expired (request a new one). |
| "Sync error, retrying" | Check the browser console. `relation "public.days" does not exist` → run `001_init.sql`. `JWT expired` → sign out and in. |
| "Offline — saved locally" | Expected without internet; changes upload when you're back online. |
| No email arrives | Built-in mailer rate limit — wait an hour or configure custom SMTP. |

## Scripts

```bash
npm run dev     # local dev server (http://localhost:5173)
npm test        # Vitest: reducer, merge, outbox, sync, migration, Supabase mapping
npm run lint    # ESLint
npm run build   # type-check + production build
```
