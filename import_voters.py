import psycopg2
import csv
import os
from dotenv import load_dotenv

# Load environment variables to securely get your Supabase URL
load_dotenv()

CSV_FILE = "voters.csv"
DB_URL = os.getenv("DATABASE_URL")

def import_voters():
    if not os.path.exists(CSV_FILE):
        print(f"Error: {CSV_FILE} not found. Please place it in the project folder.")
        return

    if not DB_URL:
        print("Error: DATABASE_URL not found. Make sure your .env file is set up correctly.")
        return

    print("Connecting to Supabase Cloud Database...")
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Connection Failed: {e}")
        return

    voters_added = 0
    voters_skipped = 0

    print("Starting voter import...")

    try:
        with open(CSV_FILE, mode='r', encoding='latin-1') as file:
            csv_reader = csv.DictReader(file)

            for row in csv_reader:
                # These must perfectly match your CSV headers
                name = row.get('Full Name', '').strip()
                email = row.get('Email Address', '').strip()
                matric_number = row.get('Matriculation Number', '').strip().upper()

                if not matric_number:
                    print(f"Rejected: {name} - Missing matriculation number.")
                    voters_skipped += 1
                    continue

                if not email:
                    print(f"Rejected: {name} - Missing email address.")
                    voters_skipped += 1
                    continue

                try:
                    # Notice the %s instead of ? and FALSE instead of 0
                    cursor.execute(
                        "INSERT INTO Voters (matric_number, name, email, has_voted) VALUES (%s, %s, %s, FALSE)",
                        (matric_number, name, email)
                    )
                    voters_added += 1
                    print(f"Added: {name} ({matric_number})")

                except psycopg2.IntegrityError:
                    # In Postgres, if a query fails, you MUST rollback the transaction
                    # before you can execute the next query in the loop.
                    conn.rollback()
                    print(f"Skipped: {matric_number} is already registered.")
                    voters_skipped += 1

        # Commit all successful additions to the cloud
        conn.commit()
        print("\n--- Cloud Import Complete ---")
        print(f"Successfully added: {voters_added}")
        print(f"Skipped/Rejected: {voters_skipped}")

    except Exception as e:
        print(f"An error occurred during processing: {e}")
        conn.rollback()

    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    import_voters()