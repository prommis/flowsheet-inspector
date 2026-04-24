import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { brodcastMessage } from './webview_handler';

let lastHistoryString = "";

export function startHistoryPolling(context: vscode.ExtensionContext) {
    console.log("Starting Flowsheet History Polling...");

    setInterval(() => {
        const idaesPath = `${os.homedir()}/.idaes`;
        const dbPath = `${idaesPath}/reportdb.sqlite`;

        // Validate if IDAES database actually exists (checking the file, not just the folder)
        if (!fs.existsSync(dbPath)) {
            // Silently return until the python script is run for the very first time and establishes the DB.
            return;
        }

        // Fetch the list of history natively by sqlite3. We use a bash logical OR (||) fallback.
        // It first attempts to query the modern schema (from minimal-wrap branch). If the 'run_status' column does not exist,
        // it gracefully suppresses the error and falls back to querying the legacy schema.
        const fetchCommand = `sqlite3 ${dbPath} "SELECT id, created, name, filename, CASE WHEN run_status = 1 THEN 1 ELSE 0 END, COALESCE(NULLIF(run_exception, ''), SUBSTR(report, INSTR(report, 'EXIT:'), 100)), tags FROM reports ORDER BY id DESC LIMIT 100;" 2>/dev/null || sqlite3 ${dbPath} "SELECT id, created, name, filename, status, SUBSTR(report, INSTR(report, 'EXIT:'), 100), tags FROM reports ORDER BY id DESC LIMIT 100;"`;

        cp.exec(fetchCommand, (err, stdout, stderr) => {
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

            const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
            const historyList = lines.map(line => {
                const [id, created, name, filename, status, rawError, tags] = line.split('|');

                let solverError = "";
                if (rawError && rawError.startsWith("EXIT:")) {
                    // Trim off trailing JSON formatting like \n\b\b\b...
                    solverError = rawError.split('\\n')[0].replace(/["\\]/g, '').trim();
                }

                // Treat falsy or '0' status as failure
                const isSuccess = parseInt(status, 10) === 1;

                return {
                    id: parseInt(id, 10),
                    created: parseFloat(created),
                    name: name ? name.trim() : "",
                    filename: filename ? filename.trim() : "",
                    status: isSuccess,
                    solverError: !isSuccess ? solverError : "",
                    tags: tags ? tags.trim() : ""
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
