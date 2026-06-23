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
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

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
    """FastAPI dependency: protects admin-only routes with a Bearer token."""
    token = _extract_bearer_token(authorization)
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
                                                              matric_number TEXT PRIMARY KEY,
                                                              name          TEXT NOT NULL,
                                                              email         TEXT NOT NULL,
                                                              has_voted     BOOLEAN NOT NULL DEFAULT FALSE
                        )
                        """)

            cur.execute("""
                        CREATE TABLE IF NOT EXISTS OTP_Sessions (
                                                                    matric_number TEXT REFERENCES Voters(matric_number),
                            otp_code      TEXT NOT NULL,
                            expires_at    TIMESTAMP NOT NULL
                            )
                        """)

            cur.execute("""
                        CREATE TABLE IF NOT EXISTS Ballots (
                                                               matric_number              TEXT PRIMARY KEY REFERENCES Voters(matric_number),
                            president                  TEXT,
                            male_vice_president        TEXT,
                            female_vice_president      TEXT,
                            minister_of_finance        TEXT,
                            minister_of_education      TEXT,
                            minister_of_information    TEXT,
                            general_secretary          TEXT
                            )
                        """)

            cur.execute("""
                        CREATE TABLE IF NOT EXISTS System_Settings (
                                                                       id            INTEGER PRIMARY KEY,
                                                                       election_open BOOLEAN NOT NULL DEFAULT TRUE
                        )
                        """)

            cur.execute("SELECT COUNT(*) FROM System_Settings")
            if cur.fetchone()[0] == 0:
                cur.execute(
                    "INSERT INTO System_Settings (id, election_open) VALUES (1, TRUE)"
                )

        conn.commit()
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
    matric_number: str


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
    password: str


# ---------------------------------------------------------------------------
# Email — Brevo HTTP API (Render free tier blocks outbound SMTP entirely,
# so we use Brevo's HTTPS API instead of smtplib)
# ---------------------------------------------------------------------------

def _otp_html(otp_code: str) -> str:
    return f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;">
            <h2 style="color:#1a1a2e;">U.S.S.A Electoral Commission</h2>
            <p>Hello,</p>
            <p>Your one-time password (OTP) for the U.S.S.A Election is:</p>
            <div style="font-size:2rem;font-weight:bold;letter-spacing:8px;
                        color:#1a1a2e;text-align:center;padding:16px 0;">
                {otp_code}
            </div>
            <p>This code expires in <strong>5 minutes</strong>.<br>
            Do not share it with anyone.</p>
            <hr style="border:none;border-top:1px solid #eee;">
            <small style="color:#888;">
                If you did not request this, please ignore this email.
            </small>
        </div>
    """


def send_otp_email(receiver_email: str, otp_code: str):
    """Send OTP via Brevo's HTTP API (port 443). Raises HTTPException on failure."""
    api_key = os.getenv("BREVO_API_KEY")
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
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json",
            },
            json={
                "sender": {
                    "name": "USSA Electoral Commission",
                    "email": sender_email,
                },
                "to": [{"email": receiver_email}],
                "subject": "USSA Election — Your Secure OTP",
                "htmlContent": _otp_html(otp_code),
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
# Helper
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
            "SELECT email FROM Voters WHERE matric_number = %s",
            (payload.matric_number,)
        )
        voter = cur.fetchone()

    if not voter:
        raise HTTPException(status_code=404, detail="Matriculation number not found.")

    email = voter["email"]
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

    # Send email — raises HTTPException if it fails
    send_otp_email(email, otp_code)

    # Only mark the cooldown / reset attempts once the email actually sent.
    _last_otp_request_at[payload.matric_number] = now
    _otp_attempt_counts[payload.matric_number] = 0

    return {
        "status": "success",
        "message": "OTP sent successfully.",
        "email": mask_email(email),
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
        # This token is the proof that OTP verification actually happened.
        # POST /api/vote requires it, so a ballot can no longer be cast just
        # by knowing/guessing a matric number.
        response["voteToken"] = create_token(
            {"matric_number": voter["matric_number"], "purpose": "vote"},
            expires_in_seconds=30 * 60,  # 30 minutes to complete the ballot
        )

    if has_voted:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM Ballots WHERE matric_number = %s",
                (payload.matric_number,)
            )
            ballot = cur.fetchone()

        if ballot:
            b = dict(ballot)
            b.pop("matric_number", None)
            response["userBallot"] = {
                "President":                                   b.get("president"),
                "Male Vice President":                         b.get("male_vice_president"),
                "Female Vice President":                       b.get("female_vice_president"),
                "Minister of Finance":                         b.get("minister_of_finance"),
                "Minister of Education, Curriculars and Sports": b.get("minister_of_education"),
                "Minister of Information and Publicity":       b.get("minister_of_information"),
                "General Secretary":                           b.get("general_secretary"),
            }

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
            cur.execute(
                """
                INSERT INTO Ballots (
                    matric_number,
                    president,
                    male_vice_president,
                    female_vice_president,
                    minister_of_finance,
                    minister_of_education,
                    minister_of_information,
                    general_secretary
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    payload.matric_number,
                    c.get("president"),
                    c.get("male_vice_president"),
                    c.get("female_vice_president"),
                    c.get("minister_of_finance"),
                    c.get("minister_of_education"),
                    c.get("minister_of_information"),
                    c.get("general_secretary"),
                ),
            )
            cur.execute(
                "UPDATE Voters SET has_voted = TRUE WHERE matric_number = %s",
                (payload.matric_number,),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[Vote Error] {e}")
        raise HTTPException(status_code=500, detail="Failed to record vote. Please try again.")

    return {"status": "success", "message": "Vote successfully cast."}


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


@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest):
    if not ADMIN_PASSWORD:
        raise HTTPException(
            status_code=500,
            detail="Admin login is not configured. Set ADMIN_PASSWORD on the server."
        )
    if not hmac.compare_digest(payload.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Incorrect admin password.")

    token = create_token({"role": "admin"}, expires_in_seconds=8 * 3600)  # 8-hour session
    return {"status": "success", "token": token}


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
def update_status(payload: StatusUpdate, conn=Depends(get_db), _admin=Depends(require_admin)):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE System_Settings SET election_open = %s WHERE id = 1",
            (payload.election_open,),
        )
    conn.commit()
    return {"status": "success", "election_open": payload.election_open}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)