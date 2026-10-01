# Persist\*

**A personal study tracker for placement season.** Thirteen weeks, five subjects, one streak.
Persist shows what's planned for today, tracks what got done, carries unfinished work forward,
and keeps the streak honest. It runs offline in the browser and can optionally sync between
laptop and phone through Supabase.

> Plan window: **Fri 2 Oct – Thu 31 Dec 2026** · 13 weeks · 3 phases
> Subjects: DSA · Java + Spring Boot · CS Fundamentals · AI · Aptitude + Applications

---

## Features

### Landing page (`/`)
A dark landing page in a warm cream palette, with three sections:
- **Hero**: video background, large animated "Persist\*" heading, and live stats (current streak, week, syllabus %).
- **About**: what the plan is, with text that fades in as you scroll.
- **Features**: cards that animate in, linking into the app.

### Tracker (`/app`)

| Page | What it does |
| --- | --- |
| **Today** `/app` | Hour-by-hour timetable (Mon–Sat) or the Sunday checkpoint, a **Now** highlight, round checkboxes, daily counters (DSA problems, applications, hours), topic tags with autocomplete, morning plan and night check-in with **Copy for Claude**, and a live "counts for streak" verdict. |
| **Syllabus** `/app/syllabus` | Per-subject progress with *Ahead / On track / Behind* badges, overall progress with phase markers, a DSA problem count against phase goals, collapsible phases → weeks → topics, filters, and a "show only pending" toggle. |
| **Streak** `/app/streak` | Current and longest streak, days counted out of 91, a GitHub-style heatmap (13 plan weeks × 7 days), one freeze per week, and an hours-per-day chart against a 10-hour target. |
| **Review** `/app/review` | Weekly targets vs actuals, score, a warning after two weeks in a row under 70%, reflection notes, and **Copy weekly review for Claude**. |

**Edit the day.** Each task row has a pencil button. You can change the text, time, or subject for
that date only (optionally for the rest of the week), reset it to the plan, add your own tasks,
or delete a planned block: either *move it to tomorrow* or *skip it today* (max 3 skips a day).

**Automatic carry-forward.** At midnight local time, unfinished tasks move to the next day. Each
keeps its original date ("from Wed 7 Oct") and a move count. After 3 moves it's marked amber, with
*Drop* (5-second undo) and *Move to…* (pick a date).

**Sync (optional).** Sign in with an email magic link and your data syncs between devices. It still
works offline: every change saves locally first and uploads when you're back online.

---

## Streak rules

- **Mon–Sat:** a day counts when **≥ 70%** of that day's tasks are done **and** at least one DSA task is done.
- **Sunday:** counts at **3 of 5** checkpoint tasks (60%, rescaled if tasks are skipped or added).
- Skipped tasks leave the day's total; your own added tasks join it; a block moved to tomorrow still counts as unfinished today.
- **Carried items never count toward today**, and finishing one later never changes the original day's verdict.
- A **frozen** day (1 per plan week) keeps the streak alive but doesn't add to it.
- Today can't break the streak until the day is over.

---

## Tech stack

- **React 18** + **TypeScript** + **Vite 5**
- **Tailwind CSS 3** (Almarai + Instrument Serif)
- **framer-motion** for animations (respects `prefers-reduced-motion`)
- **react-router-dom 6**, **date-fns**, **lucide-react**
- **Supabase** (Postgres + Auth + Row Level Security), optional
- **Vitest** + **ESLint** (typescript-eslint, react-hooks)

---

## Getting started

```bash
git clone https://github.com/debopamghosh12/Streak_Tracker.git
cd Streak_Tracker
npm install
npm run dev          # http://localhost:5173
```

That's all you need for **local-only mode**: data stays in this browser's localStorage, and the
"Sign in to sync" pill is hidden.

### Enable sync (optional)

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key>
```

Then run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) in the Supabase
SQL Editor, set up the auth redirect URLs, and restart `npm run dev`. See **[SETUP.md](SETUP.md)**
for the full walkthrough.

> Only use the public **anon/publishable** key. Never put the `service_role` key in `.env` or in the frontend.
> `.env` is git-ignored.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint |

---

## Project structure

```
src/
├── data/plan.ts            # The plan: dates, phases, 13 weeks of topics, timetable, Sunday tasks, targets
├── landing/                # Hero, About, Features
├── app/
│   ├── AppShell.tsx        # Navbar, status strip, route fade
│   ├── SyncPill.tsx        # "Sign in to sync" pill + magic-link modal
│   ├── SettingsModal.tsx   # Export / import / reset, sign out
│   └── pages/              # Today, Syllabus, Streak, Review
├── components/             # WordsPullUp, PageTitle, PillNav, shared UI (checkbox, ring, toast)
├── state/
│   ├── reducer.ts          # Pure state logic: actions, rollover, v1→v2 migration, sanitising
│   ├── store.tsx           # Provider: external store + persistence + sync hooks
│   └── types.ts
└── lib/
    ├── dates.ts            # Plan weeks (Fri–Thu), day keys
    ├── tasks.ts            # A day's effective tasks (overrides, skips, custom) + carry helpers
    ├── streak.ts           # Day verdict, current/longest streak, freezes
    ├── supabase.ts         # Supabase client (null when env vars are missing)
    └── storage/            # All persistence goes through here
        ├── localStore.ts   #   localStorage snapshot + per-record updatedAt
        ├── syncedStore.ts  #   outbox, pull/merge, first sign-in migration, status
        ├── supabaseStore.ts#   Supabase implementation of RemoteBackend
        ├── outbox.ts, merge.ts, diff.ts, kv.ts, types.ts, index.ts
supabase/migrations/001_init.sql   # Tables, triggers, indexes, RLS policies
```

---

## How data and sync work

```
 UI ──dispatch──▶ reducer (pure) ──▶ persistDiff ──▶ SyncedStore
                                                     ├─▶ LocalStore  (localStorage, immediately)
                                                     └─▶ Outbox ──1 s debounce──▶ RemoteBackend (Supabase)
                                         ◀── pull every 60 s / on focus / on reconnect: newer updated_at wins
```

- **Offline-first:** every change is written to localStorage at once, then queued in a persistent outbox. The outbox sends one batch per table and retries with exponential backoff (1 s → 60 s).
- **Merge:** each record carries an `updatedAt`. When pulling, a server row replaces the local one only if it's newer, so offline edits aren't overwritten by older server data.
- **No duplicates across devices:** carried items have deterministic ids (uuid v5 of user id + source date + task id), so two devices rolling over the same midnight write the same rows.
- **Soft deletes:** dropping a carried item sets `dropped = true`, so the deletion reaches other devices.
- **First sign-in:** local data is backed up to `prisma-backup-before-sync`, then merged with the account. Nothing is deleted on either side.
- **Swappable backend:** the app only uses the `RemoteBackend` interface (`src/lib/storage/types.ts`). To move to another server (e.g. Spring Boot), implement it and change one line in `src/lib/storage/index.ts`.

### localStorage keys

The keys keep the app's original name (*Prisma*) on purpose: renaming them would orphan existing saved progress.

| Key | Contents |
| --- | --- |
| `prisma-tracker-v2` | App state (days, carried items, topics, reviews) |
| `prisma-meta-v2` | Per-record client `updatedAt` |
| `prisma-outbox-v1` | Pending uploads |
| `prisma-sync-v1` | Signed-in user id + last pull cursors |
| `prisma-backup-before-sync` | Copy of local data taken before the first sync |
| `prisma-tracker-v1` | Legacy data, migrated automatically on first load and kept as a backup |

**Backups:** Settings (gear icon) → *Export JSON backup* / *Import JSON backup*. Imports go
through the storage layer, so they sync too.

---

## Testing

```bash
npm test
```

The suite covers:
- streak rules and edits (skips, custom tasks, Sunday scaling)
- carry-forward and rollover idempotency
- v1 → v2 migration and backup round-trips
- the merge rule (newer wins; offline edits survive)
- outbox batching, coalescing, persistence and backoff retries
- multi-device rollover without duplicates, and soft deletes
- first sign-in migration (empty server / both sides have data)
- Supabase row mapping against a mocked client

---

## Deployment (Vercel)

1. Import the repo in Vercel (framework: **Vite**, build `npm run build`, output `dist`).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Environment Variables**. They're inlined at build time, so redeploy after changing them.
3. Add your deployed URL (e.g. `https://<app>.vercel.app/**`) to Supabase → **Authentication → URL Configuration → Redirect URLs**.

`vercel.json` rewrites every route to `index.html`, so refreshing `/app/streak` works.
On Netlify, `public/_redirects` does the same job.
