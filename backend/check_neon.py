from engine import conn

tables = [
    "users",
    "properties",
    "deeds",
    "records",
    "deed_verifications",
    "mutation_applications",
    "mutation_status_history",
    "due_diligence_reports",
    "audit_logs",
    "notifications",
]

with conn() as db:
    print("===== NEON RECORD COUNTS =====")

    for table in tables:
        result = db.execute(
            f'SELECT COUNT(*) AS total FROM "{table}"'
        ).fetchone()

        print(f"{table}: {result['total']}")