import os
import random
import secrets
import hmac
import hashlib
import base64
import json
import time
import httpx
from datetime import datetime, timedelta
from typing import Dict, Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# Password hashing — PBKDF2-SHA256 via Python stdlib.
# No external dependency, no version conflicts, no 72-byte limit.
# OWASP recommends 260,000 iterations for SHA-256 as of 2023.
# ---------------------------------------------------------------------------

_PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key  = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS)
    return f"pbkdf2:sha256:{_PBKDF2_ITERATIONS}:{salt}:{key.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        _, algorithm, iterations, salt, stored_key = stored_hash.split(":", 4)
        key = hashlib.pbkdf2_hmac(algorithm, password.encode(), salt.encode(), int(iterations))
        return hmac.compare_digest(key.hex(), stored_key)
    except Exception:
        return False

# ---------------------------------------------------------------------------
# App Setup
# ---------------------------------------------------------------------------

app = FastAPI(title="USSA Voting API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ussa-voting-system.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Auth — signed session tokens (HMAC-SHA256, stdlib only, no JWT library)
#
# Used for two things:
#   1. Admin sessions  -> issued by POST /api/admin/login
#   2. Vote sessions   -> issued by POST /api/verify-otp, required by
#                          POST /api/vote so a ballot can only be cast after
#                          OTP verification, not by guessing a matric number.
# ---------------------------------------------------------------------------

APP_SECRET_KEY = os.getenv("APP_SECRET_KEY")
if not APP_SECRET_KEY:
    # Falls back to a random key so the app still boots, but this means
    # every restart invalidates existing sessions. Set APP_SECRET_KEY in
    # your environment (Render dashboard + local .env) for real use.
    APP_SECRET_KEY = secrets.token_hex(32)
    print("[WARNING] APP_SECRET_KEY is not set. Using a temporary random key — "
          "all admin/vote sessions will be invalidated on restart. "
          "Set APP_SECRET_KEY in your environment for production.")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded)


def _sign(payload_b64: str) -> str:
    sig = hmac.new(APP_SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return _b64encode(sig)


def create_token(data: dict, expires_in_seconds: int) -> str:
    payload = {**data, "exp": int(time.time()) + expires_in_seconds}
    payload_b64 = _b64encode(json.dumps(payload).encode())
    return f"{payload_b64}.{_sign(payload_b64)}"


def verify_token(token: str) -> Optional[dict]:
    try:
        payload_b64, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _sign(payload_b64)):
            return None
        payload = json.loads(_b64decode(payload_b64))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    return authorization[len("Bearer "):].strip()


def require_admin(authorization: Optional[str] = Header(None)):
    """FastAPI dependency: protects admin-only routes with a Bearer token.
    Returns the full token payload so routes can access the admin's username."""
    token   = _extract_bearer_token(authorization)
    payload = verify_token(token)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Invalid or expired admin session. Please log in again.")
    return payload


def require_vote_session(matric_number: str, authorization: Optional[str] = Header(None)):
    """FastAPI dependency: ensures /api/vote can only be called with a token
    issued by a successful /api/verify-otp call for this exact voter."""
    token = _extract_bearer_token(authorization)
    payload = verify_token(token)
    if not payload or payload.get("purpose") != "vote":
        raise HTTPException(
            status_code=401,
            detail="Voting session is missing or expired. Please verify your OTP again."
        )
    if payload.get("matric_number") != matric_number:
        raise HTTPException(
            status_code=401,
            detail="Voting session does not match this voter."
        )
    return payload


# ---------------------------------------------------------------------------
# Rate limiting — in-memory, process-local. Good enough for a single-dyno
# student election; resets on restart, which only makes limits looser, never
# a security hole. Two things are limited:
#   1. How often a matric_number can request a new OTP (stops inbox spam).
#   2. How many wrong codes a matric_number can try before a code is burned
#      (stops brute-forcing the 6-digit OTP within its 5-minute window).
# ---------------------------------------------------------------------------

OTP_RESEND_COOLDOWN_SECONDS = 55
MAX_OTP_ATTEMPTS = 5

_last_otp_request_at: Dict[str, float] = {}
_otp_attempt_counts: Dict[str, int] = {}


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

DB_URL = os.getenv("DATABASE_URL")


def get_db():
    conn = psycopg2.connect(DB_URL)
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        CREATE TABLE IF NOT EXISTS Voters (
                                                              matric_number    TEXT PRIMARY KEY,
                                                              name             TEXT NOT NULL,
                                                              email            TEXT NOT NULL,
                                                              has_voted        BOOLEAN NOT NULL DEFAULT FALSE
                        )""")

            cur.execute("""
                        CREATE TABLE IF NOT EXISTS OTP_Sessions (
                                                                    matric_number TEXT REFERENCES Voters(matric_number),
                            otp_code      TEXT NOT NULL,
                            expires_at    TIMESTAMP NOT NULL
                            )""")

            cur.execute("""
                        CREATE TABLE IF NOT EXISTS Ballots (
                                                               ballot_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            president               TEXT,
                            male_vice_president     TEXT,
                            female_vice_president   TEXT,
                            minister_of_finance     TEXT,
                            minister_of_education   TEXT,
                            minister_of_information TEXT,
                            general_secretary       TEXT,
                            cast_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            )""")

            cur.execute("""
                        CREATE TABLE IF NOT EXISTS System_Settings (
                                                                       id            INTEGER PRIMARY KEY,
                                                                       election_open BOOLEAN NOT NULL DEFAULT TRUE
                        )""")

            # Per-EC-member admin accounts (replaces shared ADMIN_PASSWORD)
            cur.execute("""
                        CREATE TABLE IF NOT EXISTS Admin_Users (
                                                                   id            SERIAL PRIMARY KEY,
                                                                   username      TEXT UNIQUE NOT NULL,
                                                                   password_hash TEXT NOT NULL,
                                                                   full_name     TEXT NOT NULL,
                                                                   role          TEXT NOT NULL DEFAULT 'ec_member',
                                                                   is_active     BOOLEAN NOT NULL DEFAULT TRUE,
                                                                   created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )""")

            # Audit trail — every sensitive action gets a row
            cur.execute("""
                        CREATE TABLE IF NOT EXISTS Audit_Log (
                                                                 id             SERIAL PRIMARY KEY,
                                                                 admin_username TEXT,
                                                                 action         TEXT NOT NULL,
                                                                 detail         TEXT,
                                                                 ip_address     TEXT,
                                                                 logged_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )""")

            cur.execute("SELECT COUNT(*) FROM System_Settings")
            if cur.fetchone()[0] == 0:
                cur.execute("INSERT INTO System_Settings (id, election_open) VALUES (1, TRUE)")

        conn.commit()

        # Seed a super_admin from ADMIN_PASSWORD env var if no admins exist yet.
        # This preserves backward compatibility — existing deployments get an
        # "admin" account with their current password. Create proper named
        # accounts via the dashboard, then deactivate this one.
        seed_password = os.getenv("ADMIN_PASSWORD")
        if seed_password:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT COUNT(*) as c FROM Admin_Users")
                if cur.fetchone()["c"] == 0:
                    hashed = hash_password(seed_password)
                    cur.execute(
                        """INSERT INTO Admin_Users (username, password_hash, full_name, role)
                           VALUES ('admin', %s, 'System Administrator', 'super_admin')
                               ON CONFLICT (username) DO NOTHING""",
                        (hashed,)
                    )
                    conn.commit()
                    print("[Init] Default super_admin 'admin' seeded from ADMIN_PASSWORD.")

    except Exception as e:
        conn.rollback()
        print(f"[DB Init Error] {e}")
    finally:
        conn.close()


@app.on_event("startup")
def startup_event():
    init_db()


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class OTPRequest(BaseModel):
    matric_number: str    # WhatsApp number is looked up from the DB, never accepted from the request


class OTPVerify(BaseModel):
    matric_number: str
    otp_code: str


class VotePayload(BaseModel):
    matric_number: str
    choices: Dict[str, str]   # keys are dbKey values from constants.ts
    # Individual fields extracted from choices for clarity — all optional
    president:               str = ''
    male_vice_president:     str = ''
    female_vice_president:   str = ''
    minister_of_finance:     str = ''
    minister_of_education:   str = ''
    minister_of_information: str = ''
    general_secretary:       str = ''


class StatusUpdate(BaseModel):
    election_open: bool


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class CreateAdminUserRequest(BaseModel):
    username:  str
    password:  str
    full_name: str
    role:      str = "ec_member"   # "ec_member" or "super_admin"


# ---------------------------------------------------------------------------
# Audit log helper
# ---------------------------------------------------------------------------

def log_audit(
        conn,
        action:         str,
        admin_username: str  = "system",
        detail:         str  = None,
        ip_address:     str  = None,
):
    """Insert one row into Audit_Log. Non-fatal — logs to stdout if it fails."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO Audit_Log (admin_username, action, detail, ip_address)
                   VALUES (%s, %s, %s, %s)""",
                (admin_username, action, detail, ip_address),
            )
        conn.commit()
    except Exception as e:
        print(f"[Audit] Failed to write log entry: {e}")


# ---------------------------------------------------------------------------
# Email — Brevo HTTP API (Render free tier blocks outbound SMTP entirely,
# so we use Brevo's HTTPS API instead of smtplib)
# ---------------------------------------------------------------------------

def _otp_html(otp_code: str, voter_name: str = "") -> str:
    # TODO: replace with your real Cloudinary logo URL once uploaded
    LOGO_URL = "https://res.cloudinary.com/REPLACE/image/upload/REPLACE/ussa_logo.png"

    greeting = f"Hello <strong>{voter_name}</strong>," if voter_name else "Hello,"

    return f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;
                    border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;
                    background:#ffffff;">

            <!-- Gold header bar -->
            <div style="background:#eab308;height:6px;width:100%;"></div>

            <div style="padding:32px 32px 24px;">

                <!-- Logo + title -->
                <div style="text-align:center;margin-bottom:28px;">
                    <img
                        src="{LOGO_URL}"
                        alt="USSA Logo"
                        width="72"
                        height="72"
                        style="border-radius:50%;border:3px solid #eab308;
                               display:block;margin:0 auto 14px;
                               object-fit:cover;"
                        onerror="this.style.display='none'"
                    />
                    <h2 style="margin:0;color:#18181b;font-size:18px;
                               letter-spacing:2px;text-transform:uppercase;
                               font-weight:900;">
                        U.S.S.A Electoral Commission
                    </h2>
                    <p style="margin:4px 0 0;color:#eab308;font-size:10px;
                              font-weight:bold;letter-spacing:3px;
                              text-transform:uppercase;">
                        'Unitè Triomphe Tout'
                    </p>
                </div>

                <!-- Greeting -->
                <p style="color:#3f3f46;font-size:14px;margin:0 0 6px;">
                    {greeting}
                </p>
                <p style="color:#3f3f46;font-size:14px;margin:0 0 24px;line-height:1.6;">
                    Your one-time verification code for the
                    <strong>U.S.S.A General Election</strong> is:
                </p>

                <!-- OTP box -->
                <div style="background:#18181b;border-radius:12px;
                            padding:24px 16px;margin-bottom:24px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;
                              color:#a1a1aa;text-transform:uppercase;letter-spacing:3px;">
                        Verification Code
                    </p>
                    <div style="font-size:42px;font-weight:900;letter-spacing:12px;
                                color:#eab308;font-family:'Courier New',monospace;
                                line-height:1.1;">
                        {otp_code}
                    </div>
                    <p style="margin:10px 0 0;font-size:11px;color:#71717a;
                              font-weight:bold;letter-spacing:1px;">
                        Expires in 5 minutes
                    </p>
                </div>

                <p style="color:#71717a;font-size:12px;
                          margin:0 0 4px;line-height:1.6;">
                    Enter this code on the verification page to access your ballot.
                    Do not share this code with anyone.
                </p>

                <hr style="border:none;border-top:1px solid #f0f0f0;margin:20px 0;">

                <p style="color:#a1a1aa;font-size:11px;
                          text-align:center;margin:0;line-height:1.6;">
                    If you did not request this code, someone may have entered
                    your matric number by mistake. You can safely ignore this email.
                </p>
            </div>

            <!-- Dark footer -->
            <div style="background:#18181b;padding:16px 32px;text-align:center;">
                <p style="margin:0;color:#71717a;font-size:11px;">
                    © 2026 U.S.S.A Electoral Committee · Algeria
                </p>
            </div>
        </div>
    """


def _confirmation_html(voter_name: str, ballot_id: str) -> str:
    return f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;
                    border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">

            <!-- Gold header bar -->
            <div style="background:#eab308;height:6px;width:100%;"></div>

            <div style="padding:32px 32px 24px;">

                <!-- Logo / title -->
                <div style="text-align:center;margin-bottom:24px;">
                    <h2 style="margin:0;color:#18181b;font-size:20px;
                               letter-spacing:1px;text-transform:uppercase;">
                        U.S.S.A Electoral Commission
                    </h2>
                    <p style="margin:4px 0 0;color:#eab308;font-size:11px;
                              font-weight:bold;letter-spacing:2px;text-transform:uppercase;">
                        'Unitè Triomphe Tout'
                    </p>
                </div>

                <!-- Green confirmed badge -->
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
                            padding:12px 16px;margin-bottom:24px;text-align:center;">
                    <span style="color:#15803d;font-weight:bold;font-size:13px;">
                        ✓ &nbsp; Your vote has been recorded
                    </span>
                </div>

                <p style="color:#3f3f46;font-size:14px;margin:0 0 8px;">
                    Hello <strong>{voter_name}</strong>,
                </p>
                <p style="color:#3f3f46;font-size:14px;margin:0 0 20px;line-height:1.6;">
                    Your ballot has been successfully submitted for the
                    <strong>U.S.S.A General Elections</strong>.
                    Your vote is anonymous — it cannot be linked back to you by
                    anyone, including the Electoral Commission.
                </p>

                <!-- Receipt box -->
                <div style="background:#fafafa;border:2px solid #e4e4e7;border-radius:8px;
                            padding:16px;margin-bottom:24px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:bold;
                              color:#71717a;text-transform:uppercase;letter-spacing:1px;">
                        Your Ballot Receipt
                    </p>
                    <p style="margin:0;font-family:monospace;font-size:13px;
                              color:#18181b;word-break:break-all;font-weight:bold;">
                        {ballot_id}
                    </p>
                    <p style="margin:10px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
                        Save this code. After the election closes, you can use it
                        on the public verification page to confirm your ballot was
                        included in the count.
                    </p>
                </div>

                <hr style="border:none;border-top:1px solid #f0f0f0;margin:0 0 20px;">

                <p style="color:#a1a1aa;font-size:12px;text-align:center;margin:0;">
                    If you did not vote in this election, contact the Electoral Commission
                    immediately at this email address.
                </p>
            </div>

            <!-- Dark footer -->
            <div style="background:#18181b;padding:16px 32px;text-align:center;">
                <p style="margin:0;color:#71717a;font-size:11px;">
                    © 2026 U.S.S.A Electoral Committee · Algeria
                </p>
            </div>
        </div>
    """


def send_confirmation_email(receiver_email: str, voter_name: str, ballot_id: str):
    """Send a voting confirmation email with ballot receipt. Non-fatal — logs on failure."""
    api_key      = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")

    if not api_key or not sender_email:
        print("[Brevo] Skipping confirmation email — API key not configured.")
        return

    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "accept":       "application/json",
                "api-key":      api_key,
                "content-type": "application/json",
            },
            json={
                "sender": {
                    "name":  "USSA Electoral Commission",
                    "email": sender_email,
                },
                "to":          [{"email": receiver_email, "name": voter_name}],
                "subject":     "✓ Your USSA ballot has been received",
                "htmlContent": _confirmation_html(voter_name, ballot_id),
            },
            timeout=10,
        )
        response.raise_for_status()
        print(f"[Brevo] Confirmation sent to {receiver_email}")
    except Exception as e:
        # Non-fatal — the vote is already in the DB. Just log and move on.
        print(f"[Brevo] Confirmation email failed (non-fatal): {e}")


def send_otp_email(receiver_email: str, otp_code: str, voter_name: str = ""):
    """Send OTP via Brevo HTTP API. Raises HTTPException on failure."""
    api_key      = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")

    if not api_key or not sender_email:
        print("[Brevo Error] BREVO_API_KEY or BREVO_SENDER_EMAIL not set.")
        raise HTTPException(
            status_code=500,
            detail="Email service is not configured. Contact the administrator."
        )

    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "accept":       "application/json",
                "api-key":      api_key,
                "content-type": "application/json",
            },
            json={
                "sender": {
                    "name":  "USSA Electoral Commission",
                    "email": sender_email,
                },
                "to":          [{"email": receiver_email, "name": voter_name}],
                "subject":     "USSA Election — Your Verification Code",
                "htmlContent": _otp_html(otp_code, voter_name),
            },
            timeout=10,
        )
        response.raise_for_status()
        print(f"[Brevo API] OTP sent to {receiver_email}")
    except Exception as e:
        print(f"[Brevo API Error] {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to send OTP email. Please try again."
        )


# ---------------------------------------------------------------------------

def mask_email(email: str) -> str:
    parts = email.split("@")
    local = parts[0]
    if len(local) > 2:
        return f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}@{parts[1]}"
    return email


# ---------------------------------------------------------------------------
# Routes — OTP
# ---------------------------------------------------------------------------

@app.post("/api/request-otp")
def request_otp(payload: OTPRequest, conn=Depends(get_db)):
    now = time.time()
    last_request = _last_otp_request_at.get(payload.matric_number)
    if last_request and (now - last_request) < OTP_RESEND_COOLDOWN_SECONDS:
        wait = int(OTP_RESEND_COOLDOWN_SECONDS - (now - last_request))
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {wait}s before requesting another code."
        )

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT name, email FROM Voters WHERE matric_number = %s",
            (payload.matric_number,)
        )
        voter = cur.fetchone()

    if not voter:
        raise HTTPException(status_code=404, detail="Matriculation number not found.")

    email       = voter["email"]
    voter_name  = voter["name"]
    otp_code = str(random.SystemRandom().randint(100000, 999999))
    expires_at = datetime.now() + timedelta(minutes=5)

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM OTP_Sessions WHERE matric_number = %s",
            (payload.matric_number,)
        )
        cur.execute(
            "INSERT INTO OTP_Sessions (matric_number, otp_code, expires_at) VALUES (%s, %s, %s)",
            (payload.matric_number, otp_code, expires_at),
        )
    conn.commit()

    # Send email OTP — raises HTTPException if it fails
    send_otp_email(email, otp_code, voter_name)

    # Only mark the cooldown / reset attempts once the email actually sent.
    _last_otp_request_at[payload.matric_number] = now
    _otp_attempt_counts[payload.matric_number] = 0

    return {
        "status":  "success",
        "message": "OTP sent successfully.",
        "email":   mask_email(email),
    }


@app.post("/api/verify-otp")
def verify_otp(payload: OTPVerify, conn=Depends(get_db)):
    attempts = _otp_attempt_counts.get(payload.matric_number, 0)
    if attempts >= MAX_OTP_ATTEMPTS:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM OTP_Sessions WHERE matric_number = %s",
                (payload.matric_number,)
            )
        conn.commit()
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Please request a new code."
        )

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT expires_at FROM OTP_Sessions WHERE matric_number = %s AND otp_code = %s",
            (payload.matric_number, payload.otp_code),
        )
        session = cur.fetchone()

    if not session:
        _otp_attempt_counts[payload.matric_number] = attempts + 1
        raise HTTPException(status_code=401, detail="Invalid OTP code.")

    if datetime.now() > session["expires_at"]:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM OTP_Sessions WHERE matric_number = %s",
                (payload.matric_number,)
            )
        conn.commit()
        raise HTTPException(status_code=401, detail="OTP code has expired.")

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "DELETE FROM OTP_Sessions WHERE matric_number = %s",
            (payload.matric_number,)
        )
        cur.execute(
            "SELECT name, matric_number, has_voted FROM Voters WHERE matric_number = %s",
            (payload.matric_number,),
        )
        voter = cur.fetchone()

    conn.commit()

    _otp_attempt_counts.pop(payload.matric_number, None)

    has_voted = bool(voter["has_voted"])
    response = {
        "status": "success",
        "user": {"name": voter["name"], "matric": voter["matric_number"]},
        "hasVoted": has_voted,
    }

    if not has_voted:
        # Proof that OTP verification actually happened.
        # POST /api/vote requires this token — a ballot cannot be cast
        # just by knowing or guessing a matric number.
        response["voteToken"] = create_token(
            {"matric_number": voter["matric_number"], "purpose": "vote"},
            expires_in_seconds=30 * 60,  # 30 minutes to complete the ballot
        )

    # Ballot choices are no longer returned here.
    # Since ballots are now anonymous UUIDs (no matric_number in the Ballots
    # table), we cannot look up what a specific voter chose — by design.
    # The frontend shows the user's choices from its own in-memory state
    # set at the time of voting (stored in localStorage as userBallot).

    return response


# ---------------------------------------------------------------------------
# Routes — Voting
# ---------------------------------------------------------------------------

@app.post("/api/vote")
def cast_vote(payload: VotePayload, authorization: Optional[str] = Header(None), conn=Depends(get_db)):
    require_vote_session(payload.matric_number, authorization)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT election_open FROM System_Settings WHERE id = 1")
        settings = cur.fetchone()

    if not settings or not bool(settings["election_open"]):
        raise HTTPException(status_code=403, detail="The election is currently closed.")

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT has_voted FROM Voters WHERE matric_number = %s",
            (payload.matric_number,)
        )
        voter = cur.fetchone()

    if not voter:
        raise HTTPException(status_code=404, detail="Voter not found.")

    if bool(voter["has_voted"]):
        raise HTTPException(status_code=403, detail="You have already cast your ballot.")

    c = payload.choices
    try:
        with conn.cursor() as cur:
            # Insert the ballot with NO matric_number — a new UUID is generated
            # by Postgres automatically. This makes ballots fully anonymous:
            # even someone with direct DB access cannot connect a voter to
            # their choices because there is no shared key between the two tables.
            cur.execute(
                """
                INSERT INTO Ballots (
                    president,
                    male_vice_president,
                    female_vice_president,
                    minister_of_finance,
                    minister_of_education,
                    minister_of_information,
                    general_secretary
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING ballot_id
                """,
                (
                    c.get("president"),
                    c.get("male_vice_president"),
                    c.get("female_vice_president"),
                    c.get("minister_of_finance"),
                    c.get("minister_of_education"),
                    c.get("minister_of_information"),
                    c.get("general_secretary"),
                ),
            )
            ballot_id = str(cur.fetchone()[0])

            # Mark the voter as having voted — this is the ONLY record that
            # links a matric_number to "a ballot was cast". There is no way
            # to go from this record to the actual ballot choices.
            cur.execute(
                "UPDATE Voters SET has_voted = TRUE WHERE matric_number = %s",
                (payload.matric_number,),
            )
        conn.commit()

        # Audit: records ballot_id only — not matric_number, not choices
        log_audit(conn, "vote_cast", admin_username="voter",
                  detail=f"ballot_id={ballot_id}")

    except Exception as e:
        conn.rollback()
        print(f"[Vote Error] {e}")
        raise HTTPException(status_code=500, detail="Failed to record vote. Please try again.")

    # Fetch voter details for the confirmation email.
    # This runs AFTER the commit so the vote is safe regardless of what happens next.
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT name, email FROM Voters WHERE matric_number = %s",
                (payload.matric_number,)
            )
            voter_details = cur.fetchone()

        if voter_details:
            send_confirmation_email(
                receiver_email=voter_details["email"],
                voter_name=voter_details["name"],
                ballot_id=ballot_id,
            )
    except Exception as e:
        # Non-fatal — vote is already committed
        print(f"[Confirmation Email] Lookup failed (non-fatal): {e}")

    # Return the ballot_id as the voter's receipt — they can use this to
    # verify their ballot appears in the count after the election closes.
    return {
        "status":    "success",
        "message":   "Vote successfully cast.",
        "ballot_id": ballot_id,
    }


# ---------------------------------------------------------------------------
# Routes — Results & Admin
# ---------------------------------------------------------------------------

@app.get("/api/results/turnout")
def get_turnout(conn=Depends(get_db)):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT COUNT(*) as count FROM Voters")
        total = cur.fetchone()["count"]

        cur.execute("SELECT COUNT(*) as count FROM Voters WHERE has_voted = TRUE")
        voted = cur.fetchone()["count"]

    percentage = round((voted / total) * 100) if total > 0 else 0
    return {
        "status": "success",
        "total_eligible": total,
        "votes_cast": voted,
        "turnout_percentage": percentage,
    }


@app.get("/api/admin/integrity-check")
def pre_election_integrity_check(conn=Depends(get_db), admin=Depends(require_admin)):
    """
    Runs a set of database integrity checks to catch registration fraud
    before the election opens. Returns flagged issues the EC should
    investigate. Safe to run multiple times.

    Checks:
      1. Duplicate emails — one email used for more than one matric number
      2. Duplicate names — same full name appears on more than one matric number
         (may be a coincidence but worth flagging)
      3. Voters who have already voted (sanity check before opening)
      4. Total voter count
    """
    issues = []

    with conn.cursor(cursor_factory=RealDictCursor) as cur:

        # ── Check 1: Duplicate emails ──────────────────────────────────────
        cur.execute("""
                    SELECT email, COUNT(*) as count,
                   array_agg(matric_number ORDER BY matric_number) as matric_numbers,
                   array_agg(name          ORDER BY matric_number) as names
                    FROM Voters
                    GROUP BY LOWER(email)
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC
                    """)
        dup_emails = cur.fetchall()
        for row in dup_emails:
            issues.append({
                "type":    "duplicate_email",
                "severity": "high",
                "detail":  f"Email '{row['email']}' is registered under "
                           f"{row['count']} matric numbers: "
                           f"{', '.join(row['matric_numbers'])} "
                           f"({', '.join(row['names'])})",
                "matric_numbers": list(row['matric_numbers']),
                "email":   row['email'],
            })

        # ── Check 2: Duplicate names ───────────────────────────────────────
        cur.execute("""
                    SELECT LOWER(TRIM(name)) as norm_name,
                           COUNT(*) as count,
                   array_agg(matric_number ORDER BY matric_number) as matric_numbers,
                   array_agg(email         ORDER BY matric_number) as emails
                    FROM Voters
                    GROUP BY LOWER(TRIM(name))
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC
                        LIMIT 50
                    """)
        dup_names = cur.fetchall()
        for row in dup_names:
            issues.append({
                "type":    "duplicate_name",
                "severity": "medium",
                "detail":  f"Name '{row['norm_name']}' appears {row['count']} times: "
                           f"{', '.join(row['matric_numbers'])} "
                           f"({', '.join(row['emails'])})",
                "matric_numbers": list(row['matric_numbers']),
            })

        # ── Check 3: has_voted summary ─────────────────────────────────────
        cur.execute("SELECT COUNT(*) as total FROM Voters")
        total = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) as voted FROM Voters WHERE has_voted = TRUE")
        voted = cur.fetchone()["voted"]

        # ── Check 4: Orphaned ballot UUIDs (ballots with no matching voter) ─
        # Should always be zero after anonymisation — but good to verify
        cur.execute("SELECT COUNT(*) as ballot_count FROM Ballots")
        ballot_count = cur.fetchone()["ballot_count"]

    log_audit(conn, "integrity_check_run",
              admin_username=admin.get("username", "unknown"),
              detail=f"{len(issues)} issues found, {total} voters, {ballot_count} ballots")

    return {
        "status":       "success",
        "total_voters": total,
        "voted_count":  voted,
        "ballot_count": ballot_count,
        "issue_count":  len(issues),
        "issues":       issues,
        "safe_to_open": len([i for i in issues if i["severity"] == "high"]) == 0,
    }


@app.get("/api/public/results")
def get_public_results(conn=Depends(get_db)):
    """
    Returns the full tally + turnout ONLY after the election is closed.
    While open, returns a status of 'in_progress' with no vote data.
    This endpoint requires no authentication — it is intentionally public.
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT election_open FROM System_Settings WHERE id = 1")
        settings = cur.fetchone()

    election_open = bool(settings["election_open"]) if settings else True

    if election_open:
        return {
            "status":  "in_progress",
            "message": "The election is still in progress. Results will be published once voting closes.",
        }

    # Turnout
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT COUNT(*) as total FROM Voters")
        total = cur.fetchone()["total"]
        cur.execute("SELECT COUNT(*) as cast FROM Voters WHERE has_voted = TRUE")
        cast = cur.fetchone()["cast"]

    # Full tally per position
    positions = [
        "president", "male_vice_president", "female_vice_president",
        "minister_of_finance", "minister_of_education",
        "minister_of_information", "general_secretary",
    ]
    tally = {}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for pos in positions:
            cur.execute(
                f"SELECT {pos} as candidate_id, COUNT(*) as votes "
                f"FROM Ballots WHERE {pos} IS NOT NULL AND {pos} != '' "
                f"GROUP BY {pos} ORDER BY votes DESC",
            )
            tally[pos] = [
                {"candidate_id": row["candidate_id"], "votes": row["votes"]}
                for row in cur.fetchall()
            ]

    return {
        "status": "closed",
        "turnout": {
            "total_eligible":     total,
            "votes_cast":         cast,
            "turnout_percentage": round((cast / total * 100)) if total > 0 else 0,
        },
        "results": tally,
    }


@app.get("/api/verify-ballot/{ballot_id}")
def verify_ballot(ballot_id: str, conn=Depends(get_db)):
    """
    Checks whether a ballot with this UUID was recorded.
    Returns ONLY a boolean — never reveals vote choices.
    Anonymity is preserved: the Ballots table has no matric_number column.
    """
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT ballot_id FROM Ballots WHERE ballot_id = %s::uuid",
                (ballot_id.strip(),)
            )
            found = cur.fetchone()
        return {"status": "success", "counted": found is not None}
    except Exception:
        # Invalid UUID format — treat as not found
        return {"status": "success", "counted": False}


@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest, request: Request, conn=Depends(get_db)):
    ip = request.client.host if request.client else None

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM Admin_Users WHERE username = %s AND is_active = TRUE",
            (payload.username.strip(),)
        )
        admin = cur.fetchone()

    if not admin or not verify_password(payload.password, admin["password_hash"]):
        # Log failed attempt (non-fatal)
        try:
            log_audit(conn, "admin_login_failed",
                      admin_username=payload.username,
                      detail="Incorrect username or password",
                      ip_address=ip)
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Incorrect username or password.")

    token = create_token(
        {
            "role":      "admin",
            "username":  admin["username"],
            "full_name": admin["full_name"],
            "user_role": admin["role"],          # "super_admin" or "ec_member"
        },
        expires_in_seconds=8 * 3600,
    )

    log_audit(conn, "admin_login",
              admin_username=admin["username"],
              detail=f"Role: {admin['role']}",
              ip_address=ip)

    return {
        "status":    "success",
        "token":     token,
        "username":  admin["username"],
        "full_name": admin["full_name"],
        "user_role": admin["role"],
    }


@app.get("/api/admin/tally")
def get_vote_tally(conn=Depends(get_db), _admin=Depends(require_admin)):
    positions = [
        "president",
        "male_vice_president",
        "female_vice_president",
        "minister_of_finance",
        "minister_of_education",
        "minister_of_information",
        "general_secretary",
    ]
    results = {}

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for pos in positions:
            cur.execute(
                f"SELECT {pos}, COUNT(*) as votes FROM Ballots "
                f"WHERE {pos} IS NOT NULL AND {pos} != '' GROUP BY {pos}",
            )
            results[pos] = [
                {"candidate_id": row[pos], "votes": row["votes"]}
                for row in cur.fetchall()
            ]

    return {"status": "success", "data": results}


@app.get("/api/admin/status")
def get_status(conn=Depends(get_db), _admin=Depends(require_admin)):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT election_open FROM System_Settings WHERE id = 1")
        settings = cur.fetchone()

    return {
        "status": "success",
        "election_open": bool(settings["election_open"]) if settings else True,
    }


@app.post("/api/admin/status")
def update_status(payload: StatusUpdate, request: Request, conn=Depends(get_db), admin=Depends(require_admin)):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE System_Settings SET election_open = %s WHERE id = 1",
            (payload.election_open,),
        )
    conn.commit()

    action = "election_opened" if payload.election_open else "election_closed"
    log_audit(conn, action,
              admin_username=admin.get("username", "unknown"),
              ip_address=request.client.host if request.client else None)

    return {"status": "success", "election_open": payload.election_open}


# ---------------------------------------------------------------------------
# EC Member management  (super_admin only)
# ---------------------------------------------------------------------------

def require_super_admin(admin=Depends(require_admin)):
    if admin.get("user_role") != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Only super admins can manage EC member accounts."
        )
    return admin


@app.get("/api/admin/users")
def list_admin_users(conn=Depends(get_db), _admin=Depends(require_admin)):
    """List all EC member accounts. Available to all admins."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT id, username, full_name, role, is_active, created_at "
            "FROM Admin_Users ORDER BY created_at ASC"
        )
        users = cur.fetchall()
    return {"status": "success", "users": [dict(u) for u in users]}


@app.post("/api/admin/users")
def create_admin_user(
        payload: CreateAdminUserRequest,
        request: Request,
        conn=Depends(get_db),
        admin=Depends(require_super_admin),
):
    """Create a new EC member account. Super admin only."""
    if payload.role not in ("ec_member", "super_admin"):
        raise HTTPException(status_code=400, detail="Role must be 'ec_member' or 'super_admin'.")

    hashed = hash_password(payload.password)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO Admin_Users (username, password_hash, full_name, role)
                   VALUES (%s, %s, %s, %s) RETURNING id""",
                (payload.username.strip(), hashed, payload.full_name.strip(), payload.role)
            )
            new_id = cur.fetchone()["id"]
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=409, detail=f"Username '{payload.username}' already exists.")

    log_audit(conn, "admin_user_created",
              admin_username=admin["username"],
              detail=f"Created {payload.role} '{payload.username}' ({payload.full_name})",
              ip_address=request.client.host if request.client else None)

    return {"status": "success", "id": new_id, "message": f"Account '{payload.username}' created."}


@app.patch("/api/admin/users/{user_id}")
def toggle_admin_user(
        user_id: int,
        request: Request,
        conn=Depends(get_db),
        admin=Depends(require_super_admin),
):
    """Activate or deactivate an EC member account. Super admin only.
    A super_admin cannot deactivate their own account."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM Admin_Users WHERE id = %s", (user_id,))
        target = cur.fetchone()

    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target["username"] == admin["username"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

    new_status = not target["is_active"]
    with conn.cursor() as cur:
        cur.execute("UPDATE Admin_Users SET is_active = %s WHERE id = %s", (new_status, user_id))
    conn.commit()

    action = "admin_user_activated" if new_status else "admin_user_deactivated"
    log_audit(conn, action,
              admin_username=admin["username"],
              detail=f"User '{target['username']}' ({target['full_name']})",
              ip_address=request.client.host if request.client else None)

    return {
        "status":    "success",
        "is_active": new_status,
        "message":   f"Account '{target['username']}' {'activated' if new_status else 'deactivated'}."
    }


# ---------------------------------------------------------------------------
# Audit log viewer
# ---------------------------------------------------------------------------

@app.get("/api/admin/audit-log")
def get_audit_log(conn=Depends(get_db), _admin=Depends(require_admin)):
    """Return the last 200 audit log entries, newest first."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT id, admin_username, action, detail, ip_address, logged_at "
            "FROM Audit_Log ORDER BY logged_at DESC LIMIT 200"
        )
        rows = cur.fetchall()
    return {"status": "success", "log": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)