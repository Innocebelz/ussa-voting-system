import psycopg2
import csv
import os
from dotenv import load_dotenv

load_dotenv()

CSV_FILE = "voters.csv"
DB_URL   = os.getenv("DATABASE_URL")

# ── Column header names from your Google Form CSV ─────────────────────────────
# Update these if your Google Form uses different question labels.
COL_NAME   = "Full Name"
COL_EMAIL  = "Email Address"
COL_MATRIC = "Matriculation Number"
# ─────────────────────────────────────────────────────────────────────────────


def import_voters():
    if not os.path.exists(CSV_FILE):
        print(f"Error: {CSV_FILE} not found. Place it in the project root.")
        return

    if not DB_URL:
        print("Error: DATABASE_URL not found in .env")
        return

    print("Connecting to database...")
    try:
        conn   = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    added   = 0
    skipped = 0

    print("Starting voter import...\n")

    try:
        with open(CSV_FILE, mode='r', encoding='latin-1') as f:
            reader = csv.DictReader(f)

            for row in reader:
                name   = row.get(COL_NAME,   '').strip()
                email  = row.get(COL_EMAIL,  '').strip()
                matric = row.get(COL_MATRIC, '').strip().upper()

                if not matric:
                    print(f"  REJECTED  {name or '?'} — missing matric number")
                    skipped += 1
                    continue

                if not email:
                    print(f"  REJECTED  {matric} — missing email")
                    skipped += 1
                    continue

                try:
                    cursor.execute(
                        """
                        INSERT INTO Voters (matric_number, name, email, has_voted)
                        VALUES (%s, %s, %s, FALSE)
                            ON CONFLICT (matric_number) DO UPDATE
                                                               SET name  = EXCLUDED.name,
                                                               email = EXCLUDED.email
                        """,
                        (matric, name, email)
                    )
                    print(f"  OK        {matric}  {name}  {email}")
                    added += 1

                except Exception as e:
                    conn.rollback()
                    print(f"  ERROR     {matric} — {e}")
                    skipped += 1

        conn.commit()
        print(f"\n── Import complete ──────────────────")
        print(f"   Added/Updated : {added}")
        print(f"   Skipped/Errors: {skipped}")

    except Exception as e:
        print(f"Processing error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    import_voters()