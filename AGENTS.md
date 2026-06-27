# Agent notes — ferrousy-website

Static personal site (Daniel Anania). Plain HTML/CSS/JS served by NGINX, no build
step. The Dockerfile copies `*.html *.css *.js` into the image. `.md` files are
NOT deployed.

## Deploy (CI/CD)

Push to `main` → auto-deploys. Set up 2026-06-27.

- **Repo:** `ferrousy94/ferrousy-website` (this repo)
- **GCP project:** `ferrousy-website` (shares the project with the whatpeoplepaid
  *website*, which has its own `whatpeoplepaid-trigger` — don't confuse them)
- **Cloud Build trigger:** `ferrousy-site-trigger` (global), `^main$` →
  `cloudbuild.yaml`, runs as `658348562858-compute@developer.gserviceaccount.com`
- **Cloud Run service:** `ferrousy-site` in **`us-east4`**
  (`https://ferrousy-site-l2tscekfba-uk.a.run.app`), custom domain
  **`danielanania.com`**
- The repo is connected via the 1st-gen Cloud Build GitHub App. To force a deploy
  without a commit: `gcloud builds triggers run ferrousy-site-trigger --branch main
  --project ferrousy-website --region global`. CLIs (`gcloud`/`firebase`) on this
  machine are authed as d5anania@gmail.com, so agents can run all of this directly.

## Firebase access (for the Budgeting Dashboard)

The private Budgeting Dashboard (`budget.html`) uses **Firebase Auth** in a
dedicated Firebase project, kept separate from the public `whatpeoplepaid` project.

- **Firebase project:** `danielanania-website` (project number `807560745546`)
- **Web app id:** `1:807560745546:web:6ab5017a948d8a2f308cb3`
- **Owner UID:** `qYHwglRT1fO9X6FRkSGgcoDS1nj1` (d5anania@gmail.com, Google sign-in)

### You already have CLI access — no credentials needed

Both CLIs on this machine are authenticated as `d5anania@gmail.com`, so you can
operate Firebase directly without anyone pasting anything:

```bash
firebase login:list                       # confirms the logged-in account
firebase projects:list                    # all projects
firebase apps:list WEB --project danielanania-website
firebase apps:sdkconfig WEB <appId> --project danielanania-website   # web config
firebase auth:export users.json --format=json --project danielanania-website  # UIDs
gcloud config get-value account           # gcloud is also authed
```

To get a user's UID, have them sign in once on the site, then run `auth:export`
and read `localId`. That's how OWNER_UID above was obtained.

### What's safe vs. off-limits

- The **web config** (apiKey, authDomain, appId, …) is **NOT secret** — it ships
  in client-side JS by design. It lives in `budget-config.js` and is fine in git.
- **Never** ask the user for, accept, or commit a service-account JSON / private
  key, and never enter their Google password. You don't need them — the CLI
  session covers all routine work (config, auth export, rules deploy).

## Budgeting Dashboard layout

- `budget-config.js` — Firebase web config + `OWNER_UID` (+ `IS_CONFIGURED`).
- `budget-auth.js`   — Firebase Auth wrapper (Google sign-in), `watchOwner()`.
- `budget.html` / `budget.js` / `budget.css` — gated dashboard (loading / setup /
  signin / denied / dashboard states). Upload + dashboard are a framework: the
  upload handler is a stub and panels show empty states. Parsing + Firestore are
  the `TODO`s.
- `utilities.html` — shows a `💰 Budgeting Dashboard` tile that is `hidden` and
  revealed only when the owner is signed in (via `watchOwner`).

### Gotchas

- `budget.css` has `[hidden] { display:none !important }` — REQUIRED, because
  `.budget-state` / `.dashboard-wrapper` / `.widget` set `display:flex`, which
  otherwise overrides the `hidden` attribute and leaks gated states + the private
  tile. Don't remove it.
- The login gate is **UI-only**. Real privacy for stored statement data must come
  from **Firestore security rules scoped to `OWNER_UID`** once data is written —
  not from hiding things client-side.
- Local preview: `python3 -m http.server 8125 --directory ferrousy-website`
  (config `ferrousy-site` in `.claude/launch.json`). `localhost` is a Firebase
  authorized domain, so Google sign-in works locally.
