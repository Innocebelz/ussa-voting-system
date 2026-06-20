# U.S.S.A Voting System

A secure, mobile-responsive electronic voting portal built for the Uganda Students' Association In Algeria (U.S.S.A). This system provides authenticated, one-time voting capabilities using email-based OTP (One-Time Password) verification.

## System Architecture

* **Frontend:** React, TypeScript, Vite, Tailwind CSS
* **Backend:** Python, FastAPI
* **Database:** SQLite
* **Authentication:** Secure 6-digit OTP delivered via SMTP (Gmail)

## Prerequisites

Before running this project, ensure you have the following installed on your machine:
* **Node.js** (v18 or higher)
* **Python** (v3.10 or higher)

## Local Development & Setup

### 1. Database Initialization & Voter Import
Place your `voters.csv` file (exported directly from Google Forms) into the root directory of the project. Ensure the column headers match the script exactly (`Full Name`, `Email Address`, `Matriculation Number`).

Run the importer script to build your local SQLite database:
```bash
python import_voters.py