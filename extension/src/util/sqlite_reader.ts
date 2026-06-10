/**
 * Centralised SQLite reader for the IDAES report database.
 *
 * Uses node-sqlite3-wasm (pure WebAssembly) so the user never needs the
 * sqlite3 CLI installed, and there are no native-module ABI issues across
 * different VS Code / Electron / Node.js versions.
 * All queries open the file with readOnly:true so concurrent Python writes
 * never cause locking errors.
 */
import { Database } from 'node-sqlite3-wasm';
import * as fs from 'fs';
import { getIdaesDbPath } from './platform_config';

// ── Types ────────────────────────────────────────────────────────────────────

export interface IHistoryRow {
    id: number;
    created: number;
    name: string;
    filename: string;
    status: number;
    rawError: string | null;
    tags: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * node-sqlite3-wasm returns TEXT columns as string on most platforms but can
 * return Uint8Array when the column affinity is BLOB.  This converts either
 * to a plain JS string so downstream code always gets a string.
 */
function toStr(value: unknown): string {
    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('utf-8');
    }
    return String(value ?? '');
}

/** Same as toStr but preserves null/undefined as null. */
function toStrNullable(value: unknown): string | null {
    if (value == null) { return null; }
    return toStr(value);
}

/**
 * Python's json.dumps() can emit bare Infinity, -Infinity, and NaN which are
 * not valid JSON.  Replace them with null before calling JSON.parse.
 */
export function sanitizeJsonString(raw: string): string {
    return raw
        .replace(/:\s*-Infinity/g, ': null')
        .replace(/:\s*Infinity/g, ': null')
        .replace(/:\s*NaN/g, ': null');
}

/**
 * Returns true when the reports table has the modern schema columns
 * (run_status, run_exception).  Legacy schema only has status.
 */
function hasModernSchema(db: Database): boolean {
    const cols = db.all('PRAGMA table_info(reports)') as { name: string }[];
    return cols.some((c) => c.name === 'run_status');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads the last 100 history rows from the IDAES report database.
 *
 * Handles both the modern schema (run_status / run_exception columns) and the
 * legacy schema (status column) transparently via a PRAGMA column check.
 * Returns an empty array when the database file does not exist yet.
 *
 * @returns Array of history rows ordered newest-first, or [] if DB is absent.
 * @throws  If the database exists but the reports table is missing or
 *          the query otherwise fails.
 */
export function queryHistory(): IHistoryRow[] {
    const dbPath = getIdaesDbPath();
    if (!fs.existsSync(dbPath)) {
        return [];
    }

    const db = new Database(dbPath, { readOnly: true });
    try {
        const sql = hasModernSchema(db)
            ? `SELECT id, created, name, filename,
                   CASE WHEN run_status = 1 THEN 1 ELSE 0 END AS status,
                   COALESCE(NULLIF(run_exception, ''), SUBSTR(report, INSTR(report, 'EXIT:'), 100)) AS rawError,
                   tags
               FROM reports ORDER BY id DESC LIMIT 100`
            : `SELECT id, created, name, filename,
                   status,
                   SUBSTR(report, INSTR(report, 'EXIT:'), 100) AS rawError,
                   tags
               FROM reports ORDER BY id DESC LIMIT 100`;
        return (db.all(sql) as unknown as Record<string, unknown>[]).map((r) => ({
            id: Number(r.id),
            created: Number(r.created),
            name: toStr(r.name),
            filename: toStr(r.filename),
            status: Number(r.status ?? 0),
            rawError: toStrNullable(r.rawError),
            tags: toStrNullable(r.tags),
        }));
    } finally {
        db.close();
    }
}

/**
 * Reads and parses the JSON report blob for a single run by its row ID.
 *
 * @param id  The primary-key ID of the reports row to fetch.
 * @returns   The parsed report object, or null if no row with that ID exists.
 * @throws    If the database cannot be opened or JSON parsing fails.
 */
export function queryReportById(id: number): unknown {
    const dbPath = getIdaesDbPath();
    const db = new Database(dbPath, { readOnly: true });
    try {
        const row = db.get('SELECT report FROM reports WHERE id = ?', id) as { report: unknown } | null;
        if (!row) {
            return null;
        }
        return JSON.parse(sanitizeJsonString(toStr(row.report)));
    } finally {
        db.close();
    }
}

/**
 * Reads and parses the most recently inserted JSON report blob.
 *
 * @returns The parsed report object, or null if the table is empty.
 * @throws  If the database cannot be opened or JSON parsing fails.
 */
export function queryLatestReport(): unknown {
    const dbPath = getIdaesDbPath();
    const db = new Database(dbPath, { readOnly: true });
    try {
        const row = db.get('SELECT report FROM reports ORDER BY id DESC LIMIT 1') as { report: unknown } | null;
        if (!row) {
            return null;
        }
        return JSON.parse(sanitizeJsonString(toStr(row.report)));
    } finally {
        db.close();
    }
}
