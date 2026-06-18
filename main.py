import os
import random
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from typing import Dict

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="LAA Voting API")

# --- PRODUCTION CORS CONFIGURATION ---
# STRICT RULE: When allow_credentials=True, you CANNOT use "*" in allow_origins.
# You must explicitly list the exact URLs that are allowed to talk to this server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://laa-voting-system.vercel.app", # Your live Vercel frontend
        "http://localhost:5173",                # Local Vite testing
        "http://localhost:3000"                 # Local React testing
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# Get Cloud Database URL from .env
DB_URL = os.getenv("DATABASE_URL")

def get_db():
    # Use RealDictCursor to keep our dict-like row access
    conn = psycopg2.connect(DB_URL)
    return conn

def init_db():
    conn = get_db()
    try:
        cursor = conn.cursor()

        # Create Tables with Postgres Syntax
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS Voters (
                                                             matric_number TEXT PRIMARY KEY,
                                                             name TEXT NOT NULL,
                                                             email TEXT NOT NULL,
                                                             has_voted BOOLEAN NOT NULL DEFAULT FALSE
                       )
                       ''')

        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS OTP_Sessions (
                                                                   matric_number TEXT,
                                                                   otp_code TEXT NOT NULL,
                                                                   expires_at TIMESTAMP NOT NULL,
                                                                   FOREIGN KEY(matric_number) REFERENCES Voters(matric_number)
                           )
                       ''')

        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS Ballots (
                                                              matric_number TEXT PRIMARY KEY,
                                                              president TEXT,
                                                              vice_president TEXT,
                                                              speaker TEXT,
                                                              treasurer TEXT,
                                                              general_secretary TEXT,
                                                              coordinator TEXT,
                                                              FOREIGN KEY(matric_number) REFERENCES Voters(matric_number)
                           )
                       ''')

        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS System_Settings (
                                                                      id INTEGER PRIMARY KEY,
                                                                      election_open BOOLEAN NOT NULL DEFAULT TRUE
                       )
                       ''')

        # Initialize the setting if it doesn't exist
        cursor.execute("SELECT COUNT(*) as count FROM System_Settings")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO System_Settings (id, election_open) VALUES (1, TRUE)")

        conn.commit()
    except Exception as e:
        print(f"Database Initialization Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

@app.on_event("startup")
def startup_event():
    init_db()

# --- Pydantic Models ---
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

# --- Helper Functions ---
def send_otp_email(receiver_email: str, otp_code: str):
    sender_email = os.getenv("EMAIL_SENDER")
    sender_password = os.getenv("EMAIL_PASSWORD")

    if not sender_email or not sender_password:
        print("Error: Email credentials missing from .env file.")
        return

    msg = MIMEText(f"Hello,\n\nYour LAA Election OTP code is: {otp_code}\n\nDo not share this code with anyone.")
    msg['Subject'] = 'LAA Election - Your Secure OTP'

    # FIX: Explicitly embed the authenticated email to pass Google's anti-spam filters
    msg['From'] = f"LAA Electoral Commission <{sender_email}>"
    msg['To'] = receiver_email

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(sender_email, sender_password)
            server.send_message(msg)
            print(f"System: Email successfully sent to {receiver_email}")
    except Exception as e:
        print(f"System Error: Failed to send email: {e}")

# --- API Routes ---
@app.post("/api/request-otp")
def request_otp(payload: OTPRequest):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("SELECT email FROM Voters WHERE matric_number = %s", (payload.matric_number,))
        voter = cursor.fetchone()

        if not voter:
            raise HTTPException(status_code=404, detail="Matriculation number not found.")

        email = voter["email"]

        email_parts = email.split('@')
        if len(email_parts[0]) > 2:
            masked_email = f"{email_parts[0][0]}{'*' * (len(email_parts[0])-2)}{email_parts[0][-1]}@{email_parts[1]}"
        else:
            masked_email = email

        otp_code = str(random.SystemRandom().randint(100000, 999999))
        expires_at = datetime.now() + timedelta(minutes=5)

        cursor.execute("DELETE FROM OTP_Sessions WHERE matric_number = %s", (payload.matric_number,))
        cursor.execute(
            "INSERT INTO OTP_Sessions (matric_number, otp_code, expires_at) VALUES (%s, %s, %s)",
            (payload.matric_number, otp_code, expires_at)
        )
        conn.commit()

        send_otp_email(email, otp_code)

        return {
            "status": "success",
            "message": "OTP sent successfully.",
            "email": masked_email
        }
    finally:
        cursor.close()
        conn.close()

@app.post("/api/verify-otp")
def verify_otp(payload: OTPVerify):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute(
            "SELECT expires_at FROM OTP_Sessions WHERE matric_number = %s AND otp_code = %s",
            (payload.matric_number, payload.otp_code)
        )
        session = cursor.fetchone()

        if not session:
            raise HTTPException(status_code=401, detail="Invalid OTP code.")

        expires_at = session["expires_at"]
        if datetime.now() > expires_at:
            cursor.execute("DELETE FROM OTP_Sessions WHERE matric_number = %s", (payload.matric_number,))
            conn.commit()
            raise HTTPException(status_code=401, detail="OTP code expired.")

        cursor.execute("DELETE FROM OTP_Sessions WHERE matric_number = %s", (payload.matric_number,))
        cursor.execute("SELECT name, matric_number, has_voted FROM Voters WHERE matric_number = %s", (payload.matric_number,))
        voter = cursor.fetchone()

        has_voted = bool(voter["has_voted"])
        response = {
            "status": "success",
            "user": {"name": voter["name"], "matric": voter["matric_number"]},
            "hasVoted": has_voted
        }

        if has_voted:
            cursor.execute("SELECT * FROM Ballots WHERE matric_number = %s", (payload.matric_number,))
            ballot = cursor.fetchone()
            if ballot:
                user_ballot = dict(ballot)
                del user_ballot["matric_number"]
                response["userBallot"] = {
                    "President": user_ballot.get("president"),
                    "Vice President": user_ballot.get("vice_president"),
                    "Speaker": user_ballot.get("speaker"),
                    "Treasurer": user_ballot.get("treasurer"),
                    "General Secretary": user_ballot.get("general_secretary"),
                    "Coordinator": user_ballot.get("coordinator")
                }

        conn.commit()
        return response
    finally:
        cursor.close()
        conn.close()

@app.post("/api/vote")
def cast_vote(payload: VotePayload):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("SELECT election_open FROM System_Settings WHERE id = 1")
        settings = cursor.fetchone()
        if not settings or not bool(settings["election_open"]):
            raise HTTPException(status_code=403, detail="The election is currently closed.")

        cursor.execute("SELECT has_voted FROM Voters WHERE matric_number = %s", (payload.matric_number,))
        voter = cursor.fetchone()

        if not voter:
            raise HTTPException(status_code=404, detail="Voter not found.")

        if bool(voter["has_voted"]):
            raise HTTPException(status_code=403, detail="Voter has already cast their ballot.")

        choices = payload.choices
        try:
            cursor.execute('''
                           INSERT INTO Ballots (
                               matric_number, president, vice_president, speaker,
                               treasurer, general_secretary, coordinator
                           ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                           ''', (
                               payload.matric_number,
                               choices.get("President"),
                               choices.get("Vice President"),
                               choices.get("Speaker"),
                               choices.get("Treasurer"),
                               choices.get("General Secretary"),
                               choices.get("Coordinator")
                           ))

            cursor.execute("UPDATE Voters SET has_voted = TRUE WHERE matric_number = %s", (payload.matric_number,))
            conn.commit()
        except Exception as e:
            print(f"Vote Error: {e}")
            conn.rollback()
            raise HTTPException(status_code=500, detail="Database write error.")

        return {"status": "success", "message": "Vote successfully cast."}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/results/turnout")
def get_turnout():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("SELECT COUNT(*) as count FROM Voters")
        total_eligible = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM Voters WHERE has_voted = TRUE")
        votes_cast = cursor.fetchone()["count"]

        percentage = 0
        if total_eligible > 0:
            percentage = round((votes_cast / total_eligible) * 100)

        return {
            "status": "success",
            "total_eligible": total_eligible,
            "votes_cast": votes_cast,
            "turnout_percentage": percentage
        }
    finally:
        cursor.close()
        conn.close()

@app.get("/api/admin/tally")
def get_vote_tally():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        positions = [
            "president", "vice_president", "speaker",
            "treasurer", "general_secretary", "coordinator"
        ]

        results = {}

        for pos in positions:
            cursor.execute(f"SELECT {pos}, COUNT(*) as votes FROM Ballots WHERE {pos} IS NOT NULL AND {pos} != '' GROUP BY {pos}")
            pos_results = cursor.fetchall()
            results[pos] = [{"candidate_id": row[pos], "votes": row["votes"]} for row in pos_results]

        return {"status": "success", "data": results}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/admin/status")
def get_status():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("SELECT election_open FROM System_Settings WHERE id = 1")
        settings = cursor.fetchone()
        return {"status": "success", "election_open": bool(settings["election_open"]) if settings else True}
    finally:
        cursor.close()
        conn.close()

@app.post("/api/admin/status")
def update_status(payload: StatusUpdate):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("UPDATE System_Settings SET election_open = %s WHERE id = 1", (payload.election_open,))
        conn.commit()
        return {"status": "success", "election_open": payload.election_open}
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)