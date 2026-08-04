/**
 * Live per-step run-status polling for fi-run.
 *
 * fi-run (flowsheet-inspector-lib) inserts an empty report row up front and
 * writes one `status` row per flowsheet step as soon as that step finishes.
 * By polling those rows while the process runs, the tree view can show — in
 * real time — which steps have completed, which succeeded or failed, and (by
 * omission) which step is currently executing.
 *
 * All database access goes through the centralised, read-only reader in
 * sqlite_reader.ts (node-sqlite3-wasm), so no sqlite3 CLI is required.
 */
import { brodcastMessage } from './webview_handler';
import { queryMaxReportId, queryStepStatuses, queryStepStatusesByRunId, queryRunException } from './sqlite_reader';

/**
 * Reads the highest report id currently in the database, to be captured as a
 * baseline right before fi-run starts (see {@link queryMaxReportId}).
 *
 * @returns The current MAX(id) of the reports table, or 0 if unavailable.
 */
export function getMaxReportId(): number {
    return queryMaxReportId();
}

/**
 * Starts polling the `status` table for the in-progress run and broadcasts
 * per-step progress to all webviews as `step_status_update`.
 *
 * Only rows belonging to a report id greater than `baselineId` are reported,
 * so stale rows from the previous run never leak through. Broadcasts only when
 * the set of statuses actually changes, to avoid spamming the webviews.
 *
 * @param baselineId  MAX(id) of reports captured before fi-run launched
 *   (see {@link getMaxReportId}).
 * @param intervalMs  Poll interval in milliseconds. Defaults to 700ms — fast
 *   enough to feel live without hammering the database.
 * @returns The interval handle; pass it to {@link stopStepStatusPolling} once
 *   the run has finished.
 */
export function startStepStatusPolling(baselineId: number, intervalMs: number = 700): NodeJS.Timeout {
    let lastBroadcast = '';

    const poll = () => {
        const rows = queryStepStatuses(baselineId);
        if (rows.length === 0) {
            return;
        }
        const serialized = JSON.stringify(rows);
        if (serialized === lastBroadcast) {
            return;
        }
        lastBroadcast = serialized;
        brodcastMessage({ type: 'step_status_update', data: rows });
    };

    // Poll immediately so any already-completed step shows without waiting a
    // full interval, then continue on the timer.
    poll();
    return setInterval(poll, intervalMs);
}

/**
 * Stops a step-status poller started by {@link startStepStatusPolling}.
 *
 * @param handle  The interval handle, or undefined (a no-op, so callers can
 *   invoke it unconditionally in a finally block).
 */
export function stopStepStatusPolling(handle: NodeJS.Timeout | undefined): void {
    if (handle) {
        clearInterval(handle);
    }
}

/**
 * Broadcasts the final per-step status of a finished run exactly once.
 *
 * The interval poller can stop a fraction of a second before fi-run writes its
 * last `status` row (e.g. the failing step it stopped on), so this is called
 * right after the run completes to guarantee the tree view reflects the final
 * state.
 *
 * If the first read returns no rows, the read is retried a few times with a
 * short delay: on Windows the report database can still be transiently
 * locked/unreadable in the instant after the fi-run process exits, and without
 * the retry the tree view would silently show no icons for the whole run.
 *
 * This authoritative broadcast is marked `final: true` and carries the run's
 * `run_exception`, which is only available once the run has finished and the
 * report row is filled in. The frontend uses this (not the intermediate
 * polling broadcasts) to write meaningful step-failure lines to the error log.
 *
 * @param baselineId  Same baseline used to start the poller
 *   (see {@link getMaxReportId}).
 * @returns The number of step-status rows found (and broadcast). 0 means no
 *   per-step status was recorded for this run at all — the caller can use this
 *   to warn that the installed flowsheet-inspector-lib is too old to write the
 *   `status` table.
 */
export async function broadcastFinalStepStatus(baselineId: number): Promise<number> {
    // After the run, the current run is the latest report row (id > baseline).
    const runId = getMaxReportId();
    if (runId <= baselineId) {
        return 0; // no new run was recorded
    }
    let rows = queryStepStatusesByRunId(runId);
    for (let attempt = 0; rows.length === 0 && attempt < 3; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        rows = queryStepStatusesByRunId(runId);
    }
    if (rows.length === 0) {
        return 0;
    }
    brodcastMessage({
        type: 'step_status_update',
        data: rows,
        runException: queryRunException(runId),
        final: true,
    });
    return rows.length;
}
