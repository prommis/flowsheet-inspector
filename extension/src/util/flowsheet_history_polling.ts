import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { brodcastMessage } from './webview_handler';

let lastMaxId = -1;

export function startHistoryPolling(context: vscode.ExtensionContext) {
    console.log("Starting Flowsheet History Polling...");


    setInterval(() => {
        const idaesPath = `${os.homedir()}/.idaes`;
        const dbPath = `${idaesPath}/reportdb.sqlite`;

        // Validate if IDAES directory exists
        if (!fs.existsSync(idaesPath)) {
            console.error(`IDAES directory not found at: ${idaesPath}`);
            brodcastMessage({
                type: 'error',
                message: `Database directory not found at ~/.idaes. Please ensure IDAES is installed and initialized properly on this system.`
            });
            // Uncomment the line below if you want the native OS alert to pop up every 5 seconds as well
            // vscode.window.showErrorMessage(`Database directory not found at ~/.idaes. Please ensure IDAES is installed and initialized properly on this system.`);
            return;
        }

        // Command to quickly check if new records were inserted
        const checkCommand = `sqlite3 ${dbPath} "SELECT MAX(id) FROM reports;"`;

        cp.exec(checkCommand, (err, stdout, stderr) => {
            if (err) {
                // If the DB doesn't exist yet or is throwing an error, silently fail and retry later
                brodcastMessage({
                    type: 'error',
                    message: `Failed to read IDAES database. Error: ${err.message || stderr}`
                });
                return;
            }

            const currentMaxId = parseInt(stdout.trim(), 10);
            if (isNaN(currentMaxId)) {
                brodcastMessage({
                    type: 'error',
                    message: `Failed to parse IDAES max ID. Received: ${stdout}`
                });
                return;
            }

            // Trigger reading full history only if there's a new ID
            if (currentMaxId !== lastMaxId) {
                lastMaxId = currentMaxId;

                console.log(`Detected SQLite changes. New Max ID: ${currentMaxId}. Fetching recent runs...`);

                // Fetch the list of history, delimited by | natively by sqlite3. We extract a quick 100 char snippet of the error message inside the blob directly!
                const fetchCommand = `sqlite3 ${dbPath} "SELECT id, created, name, filename, status, SUBSTR(report, INSTR(report, 'EXIT:'), 100) FROM reports ORDER BY id DESC LIMIT 100;"`;

                cp.exec(fetchCommand, (err2, stdout2, stderr2) => {
                    if (err2) {
                        brodcastMessage({
                            type: 'error',
                            message: `Failed to fetch IDAES history rows. Error: ${err2.message || stderr2}`
                        });
                        return;
                    }

                    const lines = stdout2.trim().split('\n').filter(l => l.trim().length > 0);
                    const historyList = lines.map(line => {
                        const [id, created, name, filename, status, rawError] = line.split('|');
                        
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
                            solverError: !isSuccess ? solverError : ""
                        };
                    });

                    // Update global state and immediately broadcast this chunk of data to React
                    context.globalState.update('idaesHistoryList', historyList);
                    brodcastMessage({ type: 'history_update', data: historyList });
                });
            }
        });

    }, 5000); // 5 seconds polling
}
