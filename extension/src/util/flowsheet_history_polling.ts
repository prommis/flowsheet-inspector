import * as fs from 'fs';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import { brodcastMessage } from './webview_handler';
import { getIdaesDbPath, buildSqliteFallbackCommand } from './platform_config';

let lastHistoryString = "";

export function startHistoryPolling(context: vscode.ExtensionContext) {
    console.log("Starting Flowsheet History Polling...");

    setInterval(() => {
        const dbPath = getIdaesDbPath();

        // Validate if IDAES database actually exists (checking the file, not just the folder)
        if (!fs.existsSync(dbPath)) {
            // Silently return until the python script is run for the very first time and establishes the DB.
            return;
        }

        // Fetch the list of history natively by sqlite3 using JSON mode to perfectly escape multiline text (like Python tracebacks).
        // Uses a fallback query for schema compatibility (modern schema → legacy schema).
        const modernQuery = "SELECT id, created, name, filename, CASE WHEN run_status = 1 THEN 1 ELSE 0 END as status, COALESCE(NULLIF(run_exception, ''), SUBSTR(report, INSTR(report, 'EXIT:'), 100)) as rawError, tags FROM reports ORDER BY id DESC LIMIT 100;";
        const legacyQuery = "SELECT id, created, name, filename, status as status, SUBSTR(report, INSTR(report, 'EXIT:'), 100) as rawError, tags FROM reports ORDER BY id DESC LIMIT 100;";
        const fetchCommand = buildSqliteFallbackCommand(dbPath, modernQuery, legacyQuery, true);

        cp.exec(fetchCommand, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
                // If the DB is completely empty (0-byte file created by accident), it will throw "no such table".
                // We should silently ignore this so we don't spam the UI, waiting for Python to actually create the table.
                const errorStr = (err.message || stderr || "").toString();
                if (errorStr.includes("no such table")) {
                    return;
                }

                // If it's a real error, broadcast it.
                brodcastMessage({
                    type: 'error',
                    message: `Failed to read IDAES database. Error: ${errorStr}`
                });
                return;
            }

            let parsedData = [];
            try {
                if (stdout.trim().length > 0) {
                    parsedData = JSON.parse(stdout);
                }
            } catch (e) {
                console.error("Failed to parse SQLite JSON:", e);
                return;
            }

            const historyList = parsedData.map((row: any) => {
                const id = row.id?.toString();
                const created = row.created?.toString();
                const name = row.name;
                const filename = row.filename;
                const status = row.status?.toString();
                const rawError = row.rawError;
                const tags = row.tags;

                let solverError = "";
                // If the rawError was from Pyomo's string manipulation
                if (rawError && rawError.startsWith("EXIT:")) {
                    solverError = rawError.split('\\n')[0].replace(/["\\]/g, '').trim();
                } else if (rawError) {
                    // It's a real traceback from the run_exception field, just use the first line or raw string
                    solverError = String(rawError).split('\n').pop()?.trim() || "Python exception thrown";
                }

                // Treat falsy or '0' status as failure
                const isSuccess = status === "1" || status === "true" || parseInt(status, 10) === 1;

                return {
                    id: parseInt(id, 10),
                    created: parseFloat(created),
                    name: name ? name.toString().trim() : "",
                    filename: filename ? filename.toString().trim() : "",
                    status: isSuccess,
                    solverError: !isSuccess ? solverError : "",
                    tags: tags ? tags.toString().trim() : ""
                };
            });

            const newHistoryString = JSON.stringify(historyList);
            if (newHistoryString !== lastHistoryString) {
                lastHistoryString = newHistoryString;
                console.log(`Detected SQLite changes. History string diff registered. Fetching and syncing recent runs...`);
                // Update global state and immediately broadcast this chunk of data to React
                context.globalState.update('idaesHistoryList', historyList);
                brodcastMessage({ type: 'history_update', data: historyList });
            }
        });

    }, 5000); // 5 seconds polling
}
