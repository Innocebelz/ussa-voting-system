# USAA Voting System

A secure, mobile-first, anonymous electronic voting portal built for the **Uganda Students' Association in Algeria (U.S.A.A)** general elections. Supports ~600 registered student voters across 7 ballot positions, with full EC oversight, per-member admin logins, a complete audit log, and a public ballot verification system.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Voter Import](#voter-import)
- [Deployment](#deployment)
- [Admin & EC Access](#admin--ec-access)
- [Ballot Positions](#ballot-positions)
- [Adding Candidates](#adding-candidates)
- [Adding a New Position](#adding-a-new-position)
- [Security Overview](#security-overview)
- [Transparency & Anonymisation](#transparency--anonymisation)

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS v4 | Vercel |
| Backend | Python 3.12 + FastAPI | Render |
| Database | PostgreSQL | Supabase |
| Email | Brevo HTTP API | – |
| Images | Cloudinary | – |

---

## Architecture

```
Browser (Vercel)
    │
    │  HTTPS
    ▼
FastAPI backend (Render)
    │
    ├── PostgreSQL (Supabase)
    │       ├── Voters
    │       ├── OTP_Sessions
    │       ├── Ballots         ← anonymous UUID, no matric_number
    │       ├── System_Settings
    │       ├── Admin_Users     ← per-EC-member accounts, bcrypt hashed
    │       └── Audit_Log
    │
    └── Brevo HTTPS API         ← OTP codes + vote confirmation emails
```

---

## Features

### Voter-Facing
- **OTP login** — matric number → 6-digit code to registered email, no password to remember
- **Rate limiting** — 55-second cooldown between OTP resends, 5-attempt lockout on wrong guesses
- **Vote session token** — proof of OTP completion required by the server before accepting a ballot
- **Mobile-first ballot** — compact candidate rows, manifesto toggle, progress bar, sticky submit
- **Confirm modal** — full summary of all 7 selections before final submission
- **Ballot receipt** — unique UUID returned after voting; stored in confirmation email
- **Vote confirmation email** — USAA-branded HTML email sent immediately after ballot is recorded
- **Public results page** — `/election-results`, no login required, live after EC closes the election
- **Ballot verification** — paste receipt UUID to confirm ballot was counted (yes/no only, no choices revealed)
- **Session expiry** — auth state clears after 12 hours; voters always start fresh on a new day

### Admin / EC-Facing
- **Per-EC-member logins** — each EC member has their own username + password
- **Two roles** — `super_admin` (full control) and `ec_member` (view only)
- **Audit log** — every sensitive action timestamped and attributed to a named user
- **Live tally** — all candidates shown including those with 0 votes; auto-refreshes every 10 seconds
- **Open / Close election** — single button with inline confirmation; only super admins
- **EC member management** — create, activate, deactivate accounts; super admin only
- **CSV export** — full results by position and candidate
- **Admin session** — stored in `sessionStorage` only; cleared when the browser tab closes

---

## Database Schema

```sql
-- Registered voters (imported from Google Form CSV)
CREATE TABLE Voters (
    matric_number  TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL,
    has_voted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- Active OTP sessions (cleared after use or expiry)
CREATE TABLE OTP_Sessions (
    matric_number  TEXT REFERENCES Voters(matric_number),
    otp_code       TEXT NOT NULL,
    expires_at     TIMESTAMP NOT NULL
);

-- Anonymous ballots — NO matric_number column
CREATE TABLE Ballots (
    ballot_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    president               TEXT,
    male_vice_president     TEXT,
    female_vice_president   TEXT,
    minister_of_finance     TEXT,
    minister_of_education   TEXT,
    minister_of_information TEXT,
    general_secretary       TEXT,
    cast_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Single row; controls whether voting is open
CREATE TABLE System_Settings (
    id             INTEGER PRIMARY KEY,
    election_open  BOOLEAN NOT NULL DEFAULT TRUE
);

-- Per-EC-member admin accounts
CREATE TABLE Admin_Users (
    id             SERIAL PRIMARY KEY,
    username       TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,        -- PBKDF2-SHA256, 260,000 iterations
    full_name      TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'ec_member',  -- or 'super_admin'
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Immutable action log
CREATE TABLE Audit_Log (
    id             SERIAL PRIMARY KEY,
    admin_username TEXT,
    action         TEXT NOT NULL,
    detail         TEXT,
    ip_address     TEXT,
    logged_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

The tables are created automatically by `init_db()` on backend startup. You only need to run the SQL manually if you want them to exist before the first deploy.

---

## Environment Variables

### Backend (`main.py` / Render dashboard)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string from Supabase |
| `BREVO_API_KEY` | ✅ | Brevo API key for sending emails |
| `BREVO_SENDER_EMAIL` | ✅ | Verified sender address in Brevo |
| `APP_SECRET_KEY` | ✅ | Signs admin and vote session tokens — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_PASSWORD` | ✅ (first boot only) | Seeds the initial `admin` / `super_admin` account on first startup. Can be removed from Render after real EC accounts are created. |

> If `APP_SECRET_KEY` is not set, the app still boots but all sessions are invalidated on every Render restart. Always set it for real elections.

### Frontend (Vercel / `.env.local`)

The frontend reads the backend URL from a constant at the top of `AuthContext.tsx` and other relevant files. Update `API_BASE_URL` / `BACKEND_URL` there directly — it is not an env var in the Vite build by default.

---

## Local Development

### Prerequisites

- Node.js ≥ 18
- Python ≥ 3.10
- A Supabase project (free tier)
- A Brevo account with a verified sender

### 1. Backend

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy the example env file and fill in your values
cp .env.example .env

python main.py
# FastAPI runs at http://localhost:8000
# Interactive API docs at http://localhost:8000/docs
```

### 2. Frontend

```bash
npm install
npm run dev
# Vite dev server at http://localhost:5173
# /api requests are proxied to http://localhost:8000 via vite.config.ts
```

---

## Voter Import

Voters are imported from a Google Form CSV export.

**Step 1 — Export from Google Forms**

Go to Google Forms → Responses → Google Sheets icon → File → Download → CSV.

**Step 2 — Rename and place**

Rename the file to `voters.csv` and put it in the project root (same folder as `main.py`).

**Step 3 — Check column headers**

Open `import_voters.py` and confirm the header names match your form:

```python
COL_NAME   = "Full Name"
COL_EMAIL  = "Email Address"
COL_MATRIC = "Matriculation Number"
```

Change these strings if your Google Form used different question labels.

**Step 4 — Run**

```bash
python import_voters.py
```

The script uses `ON CONFLICT DO UPDATE` — re-running it is safe and will update names/emails for existing matric numbers without resetting `has_voted`.

> `voters.csv` contains real student PII. It is listed in `.gitignore` and must never be committed to version control.

---

## Deployment

### Backend → Render

1. Push to your GitHub repo
2. Render auto-deploys on every push to `main`
3. Set all environment variables in Render → your service → Environment
4. Check logs on first deploy for: `[Init] Default super_admin 'admin' seeded from ADMIN_PASSWORD`

### Frontend → Vercel

1. Connect your GitHub repo to Vercel
2. Vercel auto-deploys on every push to `main`
3. No build environment variables needed — the backend URL is hardcoded in the source files

### Custom Domain (optional)

Purchase a domain (e.g. `usaavoting.com` from Namecheap) and connect it in Vercel → Settings → Domains. Follow the DNS instructions. The connection to Vercel is free.

---

## Admin & EC Access

### First login

On first deployment, a `super_admin` account is seeded automatically:
- **Username:** `admin`
- **Password:** whatever you set as `ADMIN_PASSWORD` on Render

### Handover procedure

1. Log in as `admin`
2. Go to **EC Members** tab → create a named account for each EC member (they set their own passwords)
3. Log in as each new account to confirm they work
4. Deactivate the generic `admin` account
5. Remove or rotate `ADMIN_PASSWORD` on Render (it is no longer used once real accounts exist)

### Roles

| Role | Can do |
|---|---|
| `super_admin` | Everything — open/close election, create/deactivate accounts, view all data, export CSV |
| `ec_member` | View tally, turnout, audit log — read only |

---

## Ballot Positions

Positions are defined in `src/constants.ts`. Each entry has a `dbKey` that maps to a Postgres column in the `Ballots` table.

| Display Name | `dbKey` (DB column) |
|---|---|
| President | `president` |
| Male Vice President | `male_vice_president` |
| Female Vice President | `female_vice_president` |
| Minister of Finance | `minister_of_finance` |
| Minister of Education, Curriculars & Sports | `minister_of_education` |
| Minister of Information & Publicity | `minister_of_information` |
| General Secretary | `general_secretary` |

---

## Adding Candidates

Edit `src/constants.ts` only. Find the position block and add a new candidate object:

```typescript
{
  id:        'pres_3',                                     // must be unique across the entire file
  name:      'Candidate Name',
  manifesto: 'Their campaign promise or manifesto here.',
  image:     'https://res.cloudinary.com/your-account/image/upload/....jpg',
}
```

**Rules:**
- `id` must be unique across the whole file
- Once real votes have been cast, **never change an existing `id`** — IDs are stored as votes in the database; changing them corrupts the tally
- Upload photos to Cloudinary first and paste the URL into `image`
- Push to Vercel — no backend change needed

---

## Adding a New Position

This touches **three places**:

### 1. `src/constants.ts`

Add a new block to the `ELECTION_DATA` array:

```typescript
{
  position: 'PRO',
  dbKey:    'pro',        // snake_case, no special characters
  unopposed: false,
  candidates: [
    { id: 'pro_1', name: '...', manifesto: '...', image: '...' },
    { id: 'pro_2', name: '...', manifesto: '...', image: '...' },
  ],
},
```

### 2. `main.py` — three spots

**Ballots CREATE TABLE** (in `init_db`):
```python
pro TEXT,
```

**`get_vote_tally` positions list:**
```python
positions = [
    "president", "male_vice_president", ...
    "pro",   # ← add here
]
```

**`cast_vote` INSERT query** — add `pro` to both the column list and the values tuple.

### 3. Supabase

Add the column to the live `Ballots` table:
```sql
ALTER TABLE Ballots ADD COLUMN IF NOT EXISTS pro TEXT;
```

Push and redeploy both Vercel and Render.

---

## Security Overview

| Protection | Implementation |
|---|---|
| OTP expiry | 5 minutes, single use |
| OTP rate limiting | 55s cooldown on resends, 5-attempt lockout |
| Vote session token | Short-lived signed token (HMAC-SHA256) issued by verify-otp, required by /api/vote |
| Admin session tokens | 8-hour signed tokens, stored in sessionStorage only |
| Password hashing | PBKDF2-SHA256, 260,000 iterations (OWASP recommended) |
| Timing-safe comparison | `hmac.compare_digest` used for all credential checks |
| Ballot anonymisation | No `matric_number` column in Ballots table; UUID PK only |
| Database transactions | Vote INSERT + `has_voted = TRUE` update in a single transaction |
| Audit log | Immutable from the dashboard; every sensitive action recorded |
| Session expiry | Auth state auto-clears after 12 hours |
| CORS | Restricted to known Vercel/localhost origins |

---

## Transparency & Anonymisation

### How ballots are stored

```
Voters table:   matric_number  |  name  |  email  |  has_voted
                ─────────────────────────────────────────────────
                8UGA26503      |  ...   |  ...    |  TRUE

Ballots table:  ballot_id (UUID)       |  president  |  general_secretary  |  ...
                ─────────────────────────────────────────────────────────────────
                c8a428a8-aba5-42a9...  |  pres_1    |  gsec_2             |  ...
```

There is no foreign key, join, or shared column between these two tables. Nobody — including the developer — can connect a specific voter to their specific choices.

### Ballot verification

After voting, each voter receives a UUID receipt. After the election closes, they can paste this UUID into the verification box on `/election-results` to confirm their ballot was counted. The endpoint returns **only** `{ "counted": true }` or `{ "counted": false }` — it never returns vote choices.

### What the EC can verify independently

- **Supabase dashboard** — read-only access to all raw tables
- **API documentation** — every backend route is publicly inspectable at `/docs`
- **Source code** — the GitHub repository can be shared with any technical reviewer the EC appoints
- **Audit log** — every admin action attributed to a named user with timestamp and IP

---

## Notes

- The `static/` folder and its `/static` mount have been removed — candidate photos are hosted on Cloudinary
- `voters.csv` is in `.gitignore` and must never be committed
- The `motion` library has been removed — animations use native CSS and `requestAnimationFrame` instead, keeping the bundle size down
- Render's free tier spins down after 15 minutes of inactivity — the first voter of the day may experience a 30-60 second cold start. Consider a keep-alive ping during election hours
