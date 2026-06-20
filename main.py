import os
import random
import httpx
from datetime import datetime, timedelta
from typing import Dict

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# App Setup
# ---------------------------------------------------------------------------

app = FastAPI(title="LAA Voting API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://laa-voting-system.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

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
                                                               matric_number    TEXT PRIMARY KEY REFERENCES Voters(matric_number),
                            president        TEXT,
                            vice_president   TEXT,
                            speaker          TEXT,
                            treasurer        TEXT,
                            general_secretary TEXT,
                            coordinator      TEXT
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
    choices: Dict[str, str]


class StatusUpdate(BaseModel):
    election_open: bool


# ---------------------------------------------------------------------------
# Email — Brevo HTTP API (Render free tier blocks outbound SMTP entirely,
# so we use Brevo's HTTPS API instead of smtplib)
# ---------------------------------------------------------------------------

def _otp_html(otp_code: str) -> str:
    return f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;">
            <h2 style="color:#1a1a2e;">LAA Electoral Commission</h2>
            <p>Hello,</p>
            <p>Your one-time password (OTP) for the LAA Election is:</p>
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
    api_key = os.getenv("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")
    sender_email = os.getenv("enositbale@gmail.com")

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
                    "name": "LAA Electoral Commission",
                    "email": sender_email,
                },
                "to": [{"email": receiver_email}],
                "subject": "LAA Election — Your Secure OTP",
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

    return {
        "status": "success",
        "message": "OTP sent successfully.",
        "email": mask_email(email),
    }


@app.post("/api/verify-otp")
def verify_otp(payload: OTPVerify, conn=Depends(get_db)):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT expires_at FROM OTP_Sessions WHERE matric_number = %s AND otp_code = %s",
            (payload.matric_number, payload.otp_code),
        )
        session = cur.fetchone()

    if not session:
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

    has_voted = bool(voter["has_voted"])
    response = {
        "status": "success",
        "user": {"name": voter["name"], "matric": voter["matric_number"]},
        "hasVoted": has_voted,
    }

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
                "President":        b.get("president"),
                "Vice President":   b.get("vice_president"),
                "Speaker":          b.get("speaker"),
                "Treasurer":        b.get("treasurer"),
                "General Secretary": b.get("general_secretary"),
                "Coordinator":      b.get("coordinator"),
            }

    return response


# ---------------------------------------------------------------------------
# Routes — Voting
# ---------------------------------------------------------------------------

@app.post("/api/vote")
def cast_vote(payload: VotePayload, conn=Depends(get_db)):
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
                INSERT INTO Ballots
                (matric_number, president, vice_president, speaker,
                 treasurer, general_secretary, coordinator)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    payload.matric_number,
                    c.get("President"),
                    c.get("Vice President"),
                    c.get("Speaker"),
                    c.get("Treasurer"),
                    c.get("General Secretary"),
                    c.get("Coordinator"),
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


@app.get("/api/admin/tally")
def get_vote_tally(conn=Depends(get_db)):
    positions = [
        "president", "vice_president", "speaker",
        "treasurer", "general_secretary", "coordinator",
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
def get_status(conn=Depends(get_db)):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT election_open FROM System_Settings WHERE id = 1")
        settings = cur.fetchone()

    return {
        "status": "success",
        "election_open": bool(settings["election_open"]) if settings else True,
    }


@app.post("/api/admin/status")
def update_status(payload: StatusUpdate, conn=Depends(get_db)):
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