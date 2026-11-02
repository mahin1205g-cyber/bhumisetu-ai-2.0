"""Reset an existing officer/admin password from a trusted server shell."""

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
    parser = argparse.ArgumentParser(description="Reset an existing privileged user's password")
    parser.add_argument("--role", required=True, choices=("admin", "officer"))
    args = parser.parse_args()
    if not os.environ.get("DATABASE_URL"):
        parser.error("Set DATABASE_URL in the repository .env file first")

    email = input(f"Existing {args.role} email: ").strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        print("Enter a valid email address.", file=sys.stderr)
        return 2
    password = getpass.getpass("New password (minimum 8 characters): ")
    confirmation = getpass.getpass("Confirm new password: ")
    if len(password) < 8 or password != confirmation:
        print("Passwords must match and contain at least 8 characters.", file=sys.stderr)
        return 2

    engine.init()
    with engine.conn() as conn:
        account = conn.execute(
            "SELECT id,name,role FROM users WHERE LOWER(email)=%s FOR UPDATE", (email,)
        ).fetchone()
        if not account or account["role"] != args.role:
            print(f"No existing {args.role} account found for that email. No changes made.", file=sys.stderr)
            return 2
        password_hash, salt = engine.hash_password(password)
        conn.execute(
            "UPDATE users SET password_hash=%s,salt=%s,auth_version=auth_version+1 WHERE id=%s",
            (password_hash, salt, account["id"]),
        )

    engine.log_audit(account["name"], account["role"], "PASSWORD_RESET", "AUTH", "Password reset from trusted server shell")
    print(f"Password reset for {email}. Sign in through the {args.role} portal.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
