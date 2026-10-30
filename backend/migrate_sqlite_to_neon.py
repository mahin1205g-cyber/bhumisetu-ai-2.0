
import sqlite3
from pathlib import Path

from psycopg import sql
from engine import conn


# ==========================================
# CONFIGURATION
# ==========================================

SOURCE_DB = Path(__file__).with_name("landtech.db")

TABLES = [
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


# ==========================================
# MIGRATION FUNCTION
# ==========================================

def migrate():

    # 1. Check source database
    if not SOURCE_DB.exists():
        raise FileNotFoundError(
            f"Source database not found: {SOURCE_DB}"
        )

    source = sqlite3.connect(SOURCE_DB)
    source.row_factory = sqlite3.Row

    try:

        # PostgreSQL transaction
        with conn() as target:

            print("\n===== STEP 1: NEON SAFETY CHECK =====")

            # Check all Neon tables are empty
            for table in TABLES:

                result = target.execute(
                    sql.SQL("SELECT COUNT(*) FROM {}").format(
                        sql.Identifier(table)
                    )
                ).fetchone()

                count = result["count"]

                if count != 0:
                    raise RuntimeError(
                        f"Migration stopped!\n"
                        f"Table: {table}\n"
                        f"Existing records: {count}\n"
                        f"Neon must be empty before migration."
                    )

            print("SUCCESS: All Neon tables are empty.")

            # ==================================
            # 2. CHECK TABLE COLUMNS
            # ==================================

            print("\n===== STEP 2: COLUMN VALIDATION =====")

            for table in TABLES:

                source_columns = [
                    row["name"]
                    for row in source.execute(
                        f'PRAGMA table_info("{table}")'
                    ).fetchall()
                ]

                target_columns = [
                    row["column_name"]
                    for row in target.execute("""
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                        AND table_name = %s
                        ORDER BY ordinal_position
                    """, (table,)).fetchall()
                ]

                if not source_columns:
                    raise RuntimeError(
                        f"SQLite table not found: {table}"
                    )

                if source_columns != target_columns:
                    raise RuntimeError(
                        f"Column mismatch: {table}\n"
                        f"SQLite: {source_columns}\n"
                        f"Neon: {target_columns}"
                    )

                print(f"{table}: Columns matched.")

            print("\nAll table columns matched.")

            # ==================================
            # 3. MIGRATE RECORDS
            # ==================================

            print("\n===== STEP 3: DATA MIGRATION =====")

            migrated_counts = {}

            for table in TABLES:

                rows = source.execute(
                    f'SELECT * FROM "{table}" ORDER BY id'
                ).fetchall()

                if not rows:
                    migrated_counts[table] = 0
                    print(f"{table}: 0 records")
                    continue

                columns = list(rows[0].keys())

                # Build safe INSERT query
                query = sql.SQL(
                    "INSERT INTO {} ({}) VALUES ({})"
                ).format(
                    sql.Identifier(table),

                    sql.SQL(", ").join(
                        sql.Identifier(column)
                        for column in columns
                    ),

                    sql.SQL(", ").join(
                        sql.Placeholder()
                        for _ in columns
                    )
                )

                # Prepare values
                values = [
                    tuple(row[column] for column in columns)
                    for row in rows
                ]

                # Insert using Cursor executemany
                with target.cursor() as cur:
                    cur.executemany(query, values)

                migrated_counts[table] = len(rows)

                print(
                    f"{table}: {len(rows)} records copied."
                )

            # ==================================
            # 4. RESET ID SEQUENCES
            # ==================================

            print("\n===== STEP 4: UPDATE ID SEQUENCES =====")

            for table in TABLES:

                sequence_result = target.execute(
                    """
                    SELECT pg_get_serial_sequence(
                        %s,
                        'id'
                    ) AS sequence
                    """,
                    (f"public.{table}",)
                ).fetchone()

                sequence = sequence_result["sequence"]

                if sequence:

                    target.execute(
                        sql.SQL("""
                            SELECT setval(
                                %s::regclass,
                                COALESCE(MAX(id), 1),
                                MAX(id) IS NOT NULL
                            )
                            FROM {}
                        """).format(
                            sql.Identifier(table)
                        ),
                        (sequence,)
                    )

                    print(f"{table}: ID sequence updated.")

            # ==================================
            # 5. VERIFY MIGRATED RECORDS
            # ==================================

            print("\n===== STEP 5: VERIFY DATA =====")

            total_records = 0

            for table in TABLES:

                actual_count = target.execute(
                    sql.SQL(
                        "SELECT COUNT(*) FROM {}"
                    ).format(
                        sql.Identifier(table)
                    )
                ).fetchone()["count"]

                expected_count = migrated_counts[table]

                if actual_count != expected_count:

                    raise RuntimeError(
                        f"Verification failed: {table}\n"
                        f"Expected: {expected_count}\n"
                        f"Actual: {actual_count}"
                    )

                total_records += actual_count

                print(
                    f"{table}: "
                    f"{actual_count}/{expected_count} verified."
                )

            print("\nTotal records:", total_records)

        # Transaction committed after successful verification
        print("\n====================================")
        print("MIGRATION SUCCESSFUL!")
        print("All records copied and verified.")
        print("====================================")

    finally:
        source.close()


# ==========================================
# MAIN
# ==========================================

if __name__ == "__main__":

    try:
        migrate()

    except Exception as error:

        print("\n====================================")
        print("MIGRATION FAILED!")
        print("Reason:", error)
        print("====================================")
        print("No partial transaction should remain.")
