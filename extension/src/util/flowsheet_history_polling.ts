import * as vscode from 'vscode';
import { brodcastMessage } from './webview_handler';
import { queryHistory, IHistoryRow } from './sqlite_reader';

let lastHistoryString = "";

// When true the interval skips its SQLite read entirely. Set around a report
// DB migration: the lib swaps the DB file with a rename, which fails on
// Windows if this process still holds a read handle on the old file.
let pollingPaused = false;

/**
 * Suspends the history poller's SQLite reads until resumeHistoryPolling is
 * called. Used while `fi-db migrate` rewrites the report database.
 */
export function pauseHistoryPolling(): void {
    pollingPaused = true;
}

/**
 * Re-enables the history poller and forces the next tick to re-broadcast even
 * if the row list looks unchanged, because the migration may have rewritten
 * rows (e.g. legacy status columns) without changing the diffed summary.
 */
export function resumeHistoryPolling(): void {
    pollingPaused = false;
    lastHistoryString = "";
}

export function startHistoryPolling(context: vscode.ExtensionContext) {
    console.log("Starting Flowsheet History Polling...");

    setInterval(() => {
        if (pollingPaused) {
            return;
        }
        let rows: IHistoryRow[];
        try {
            rows = queryHistory();
        } catch (e: any) {
            // Silently ignore "no such table" — the DB exists but Python hasn't
            // created the reports table yet (first-ever run not started).
            if (e.message?.includes('no such table')) {
                return;
            }
            brodcastMessage({
                type: 'error',
                message: `Failed to read IDAES database. Error: ${e.message}`
            });
            return;
        }

        const historyList = rows.map((row) => {
            const id = row.id;
            const created = row.created;
            const name = row.name;
            const filename = row.filename;
            const rawError = row.rawError ?? '';
            const tags = row.tags ?? '';

            let solverError = "";
            if (rawError.startsWith("EXIT:")) {
                solverError = rawError.split('\\n')[0].replace(/["\\]/g, '').trim();
            } else if (rawError) {
                solverError = String(rawError).split('\n').pop()?.trim() || "Python exception thrown";
            }

            const isSuccess = row.status === 1;

            return {
                id,
                created,
                name: name ? String(name).trim() : "",
                filename: filename ? String(filename).trim() : "",
                status: isSuccess,
                solverError: !isSuccess ? solverError : "",
                tags: tags ? String(tags).trim() : ""
            };
        });

        const newHistoryString = JSON.stringify(historyList);
        if (newHistoryString !== lastHistoryString) {
            lastHistoryString = newHistoryString;
            console.log(`Detected SQLite changes. History string diff registered. Fetching and syncing recent runs...`);
            context.globalState.update('idaesHistoryList', historyList);
            brodcastMessage({ type: 'history_update', data: historyList });
        }
    }, 5000);
}
