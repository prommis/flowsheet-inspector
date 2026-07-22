"""Export the most recent flowsheet run report from the local report database
to ``sample_report.json`` for use by the E2E driver (drive_vscode.mjs).

The report column may come back as bytes and may contain bare ``Infinity`` /
``NaN`` tokens (Python's json.dumps emits them, but they are not valid JSON),
so both are handled here — mirroring what the extension's sqlite_reader does.
"""
import json
import os
import re
import sqlite3
import sys

DB_PATH = os.path.expanduser("~/.idaes/reportdb.sqlite")
OUT_PATH = os.path.join(os.path.dirname(__file__), "sample_report.json")


def sanitize(raw: str) -> str:
    """Replace non-JSON Infinity/NaN tokens with null, like sqlite_reader.ts."""
    raw = re.sub(r":\s*-?Infinity", ": null", raw)
    return re.sub(r":\s*NaN", ": null", raw)


def main() -> None:
    if not os.path.exists(DB_PATH):
        sys.exit(f"Report DB not found at {DB_PATH} — run a flowsheet once first.")

    db = sqlite3.connect(DB_PATH)
    row = db.execute("SELECT id, report FROM reports ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        sys.exit("Report DB has no runs — run a flowsheet once first.")

    raw = row[1].decode() if isinstance(row[1], bytes) else row[1]
    report = json.loads(sanitize(raw))

    with open(OUT_PATH, "w") as f:
        json.dump(report, f)
    print(f"Exported report id={row[0]} to {OUT_PATH}")


if __name__ == "__main__":
    main()
