"""Create or promote a privileged Bhumisetu account from a trusted server shell.

Requires DATABASE_URL in the environment. Never expose this script as an API.
"""

import argparse
import getpass
import os
import re
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)
except ImportError:
    pass

try:
    from backend import engine
except ModuleNotFoundError:
    import engine


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Bhumisetu admin or officer account")
    parser.add_argument("--role", required=True, choices=("admin", "officer"))
    args = parser.parse_args()

    if not os.environ.get("DATABASE_URL"):
        parser.error("DATABASE_URL must point to the intended PostgreSQL database")

    name = input("Full name: ").strip()
    username = input("Username (4-30 letters, numbers, underscores, periods): ").strip()
    email = input("Email: ").strip().lower()
    if len(name) < 2 or not re.fullmatch(r"[A-Za-z0-9_.]{4,30}", username) or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        print("Enter a valid name, username, and email.", file=sys.stderr)
        return 2

    password = getpass.getpass("Password (minimum 8 characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if len(password) < 8 or password != confirmation:
        print("Passwords must match and contain at least 8 characters.", file=sys.stderr)
        return 2

    engine.init()
    with engine.conn() as conn:
        existing = conn.execute("SELECT id FROM users WHERE LOWER(email) = %s OR LOWER(username) = LOWER(%s)", (email, username)).fetchone()
        if existing:
            print("That email or username already belongs to an account. No changes made.", file=sys.stderr)
            return 2

    user = engine.create_user(name=name, email=email, password=password, username=username, role=args.role)
    print(f"Created {args.role} account: {user['email']} (ID {user['id']})")
    print(f"Sign in through the standard login form with username {user['username']} or email and password.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
