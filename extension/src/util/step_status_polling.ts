import * as cp from 'child_process';
import * as fs from 'fs';
import { brodcastMessage } from './webview_handler';
import { getIdaesDbPath, buildSqliteCommand, getStderrRedirect } from './platform_config';

/**
 * A single per-step status row read from the `status` table of the IDAES
 * report database. Written live by `fi-run` (flowsheet-inspector-lib) as each
 * flowsheet step finishes, so it can be observed while the run is in progress.
 */
export interface IStepStatus {
    /** Position of the step in the runner's step sequence (non-contiguous). */
    step_num: number;
    /** Step name, matches the names returned by `fi-steps`. */
    step_name: string;
    /** 0 when the step succeeded, non-zero when it failed. */
    errcode: number;
    /** Error message for a failed step, empty string otherwise. */
    errmsg: string;
}

/**
 * Reads the highest report id currently in the database.
 *
 * This is captured as a baseline right before `fi-run` starts so the step
 * poller can tell the about-to-be-created in-progress report row apart from
 * the previous run's rows. `fi-run` inserts an empty report row up front and
 * only then starts writing `status` rows that reference it, so the current
 * run's id is always strictly greater than this baseline.
 *
 * @returns The current `MAX(id)` of the reports table, or 0 if the database or
 *   table does not exist yet (first ever run).
 */
export function getMaxReportId(): Promise<number> {
    return new Promise((resolve) => {
        const dbPath = getIdaesDbPath();
        if (!fs.existsSync(dbPath)) {
            resolve(0);
            return;
        }
        const query = 'SELECT COALESCE(MAX(id), 0) FROM reports;';
        const cmd = `${buildSqliteCommand(dbPath, query)} ${getStderrRedirect()}`;
        cp.exec(cmd, { windowsHide: true }, (err, stdout) => {
            if (err) {
                // Table may not exist yet on a brand-new DB; treat as no runs.
                resolve(0);
                return;
            }
            const value = parseInt(stdout.trim(), 10);
            resolve(Number.isNaN(value) ? 0 : value);
        });
    });
}

/**
 * Starts polling the `status` table for the currently running flowsheet and
 * broadcasts per-step progress to all webviews as `step_status_update`.
 *
 * `fi-run` writes one `status` row per step as soon as that step finishes, so
 * polling reveals — in real time — which steps have completed, which succeeded
 * or failed, and (by omission) which step is currently executing. Only rows
 * belonging to the in-progress run (report id greater than `baselineId`) are
 * reported, so stale rows from the previous run are never shown.
 *
 * The `status` table only exists in the modern schema; if it is missing (older
 * database not yet migrated) the query errors are swallowed and nothing is
 * broadcast, which is harmless.
 *
 * @param baselineId - The `MAX(id)` of the reports table captured immediately
 *   before `fi-run` was launched (see {@link getMaxReportId}).
 * @param intervalMs - Poll interval in milliseconds. Defaults to 700ms, fast
 *   enough to feel live without hammering SQLite.
 * @returns The interval handle; pass it to {@link stopStepStatusPolling} (or
 *   `clearInterval`) once the run has finished.
 */
export function startStepStatusPolling(baselineId: number, intervalMs: number = 700): NodeJS.Timeout {
    const dbPath = getIdaesDbPath();
    // Only report rows for the in-progress run (id > baseline). The subquery
    // yields NULL until fi-run inserts its empty report row, and `run_id = NULL`
    // matches nothing, so no stale rows leak through before the run truly starts.
    const query =
        `SELECT step_num, step_name, errcode, errmsg FROM status ` +
        `WHERE run_id = (SELECT MAX(id) FROM reports WHERE id > ${baselineId}) ` +
        `ORDER BY step_num;`;
    const cmd = `${buildSqliteCommand(dbPath, query, true)} ${getStderrRedirect()}`;

    let lastBroadcast = '';

    const poll = () => {
        if (!fs.existsSync(dbPath)) {
            return;
        }
        cp.exec(cmd, { windowsHide: true }, (err, stdout) => {
            if (err) {
                // `status` table may not exist yet / DB busy — ignore silently.
                return;
            }
            const trimmed = stdout.trim();
            if (!trimmed) {
                return;
            }
            let rows: IStepStatus[] = [];
            try {
                rows = JSON.parse(trimmed);
            } catch {
                return;
            }
            // Only broadcast when the set of step statuses actually changed, to
            // avoid spamming the webviews with identical updates every tick.
            const serialized = JSON.stringify(rows);
            if (serialized === lastBroadcast) {
                return;
            }
            lastBroadcast = serialized;
            brodcastMessage({ type: 'step_status_update', data: rows });
        });
    };

    // Poll immediately so the UI reflects any already-completed step without
    // waiting a full interval, then continue on the timer.
    poll();
    return setInterval(poll, intervalMs);
}

/**
 * Stops a step-status poller started by {@link startStepStatusPolling}.
 *
 * @param handle - The interval handle returned by {@link startStepStatusPolling},
 *   or undefined (a no-op, so callers can call it unconditionally in a finally).
 */
export function stopStepStatusPolling(handle: NodeJS.Timeout | undefined): void {
    if (handle) {
        clearInterval(handle);
    }
}

/**
 * Broadcasts the final per-step status of a finished run exactly once.
 *
 * The interval poller can stop a fraction of a second before `fi-run` writes
 * its last `status` row (e.g. the failing step it stopped on), so this is
 * called right after the run completes to guarantee the tree view reflects the
 * final state. Failures are swallowed — a missed final broadcast is non-fatal.
 *
 * @param baselineId - Same baseline used to start the poller (see
 *   {@link getMaxReportId}).
 */
export function broadcastFinalStepStatus(baselineId: number): void {
    const dbPath = getIdaesDbPath();
    if (!fs.existsSync(dbPath)) {
        return;
    }
    const query =
        `SELECT step_num, step_name, errcode, errmsg FROM status ` +
        `WHERE run_id = (SELECT MAX(id) FROM reports WHERE id > ${baselineId}) ` +
        `ORDER BY step_num;`;
    const cmd = `${buildSqliteCommand(dbPath, query, true)} ${getStderrRedirect()}`;
    cp.exec(cmd, { windowsHide: true }, (err, stdout) => {
        if (err) {
            return;
        }
        const trimmed = stdout.trim();
        if (!trimmed) {
            return;
        }
        try {
            const rows: IStepStatus[] = JSON.parse(trimmed);
            brodcastMessage({ type: 'step_status_update', data: rows });
        } catch {
            // Ignore malformed JSON.
        }
    });
}
