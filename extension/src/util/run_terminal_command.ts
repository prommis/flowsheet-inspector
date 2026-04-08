import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import { brodcastMessage } from './webview_handler';
/**
 * A helper function to execute a terminal command asynchronously.
 * Runs the given command in the specified shell. Once the command completes,
 * it reads and parses the JSON content from the output file, stores it in
 * vscode globalState, and resolves the Promise with the parsed data.
 *
 * @param context - The vscode context
 * @param command - The terminal command to execute (e.g., "source .zshrc && conda activate env && idaes-run ...")
 * @param shell - The shell executable path (e.g., "/bin/zsh", "/bin/bash", or "C:\\Windows\\System32\\powershell.exe")
 * @param outputFilePath - The file path where the command writes its output data
 * @param vscodeContextStateName - The name of the vscode context state to update
 * @returns A Promise that resolves with the parsed JSON data from the output file
 */
import * as os from 'os';

export default function runTerminalCommand(context: vscode.ExtensionContext, command: string, shell: string, outputFilePath: string, vscodeContextStateName: string): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!context) { reject(new Error(`runTerminalCommand requires context as param!`)); return; }
        if (!command) { reject(new Error(`runTerminalCommand requires command as param!`)); return; }
        if (!shell) { reject(new Error(`runTerminalCommand requires shell as param!`)); return; }
        if (!outputFilePath) { reject(new Error(`runTerminalCommand requires outputFilePath as param!`)); return; }

        if (outputFilePath.startsWith('~')) {
            outputFilePath = outputFilePath.replace(/^~/, os.homedir());
        }

        console.log(`
            Starting execute terminal command:
            ${command}
            Terminal environment is:
            ${shell}
            Output file path is:
            ${outputFilePath}
            ...
        `);
        // Start execute terminal command and write to outputFilePath, then write to context.globalState.vscodeContextStateName
        brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Executing background process via SPAWN...\nCommand: ${command}\nShell: ${shell}\n` });

        // Delete the output file if it exists to ensure we don't read stale data from a previous run
        try {
            if (fs.existsSync(outputFilePath)) {
                fs.unlinkSync(outputFilePath);
                console.log(`Deleted stale output file at ${outputFilePath}`);
            }
        } catch (e) {
            console.warn(`Could not delete stale output file: ${e}`);
        }

        const child = cp.spawn(shell, ['-c', command], {
            detached: true,
            env: Object.assign({}, process.env, { PYTHONUNBUFFERED: "1", FORCE_COLOR: "1" })
        });

        brodcastMessage({ type: 'process_started', pid: child.pid });

        let fullStdout = "";
        let fullStderr = "";

        child.stdout.on('data', (data) => {
            fullStdout += data.toString();
            brodcastMessage({ type: 'terminal_log', data: data.toString() });
        });

        child.stderr.on('data', (data) => {
            fullStderr += data.toString();
            brodcastMessage({ type: 'terminal_log', data: data.toString() });
        });

        child.on('error', (error) => {
            console.error(`runTerminalCommand error: ${error}`);
            brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM ERROR] Process failed to spawn: ${error}\n` });
            reject(error);
        });

        child.on('close', (code, signal) => {
            console.log(`Finished run shell command with code ${code} and signal ${signal}. Starting to read data from output file: ${outputFilePath}`);

            if (signal === 'SIGKILL' || signal === 'SIGTERM' || signal === 'SIGINT') {
                brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Run flowsheet stopped manually. PID: ${child.pid}\n` });
                reject(new Error(`CANCELED_BY_USER:${child.pid}`));
                return;
            }

            brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Process exited with code ${code}.\nCollected stdout bytes: ${fullStdout.length}\nCollected stderr bytes: ${fullStderr.length}\n` });

            if (code !== 0) {
                let errMsg = `Process failed (exit code ${code}).\n`;
                if (fullStderr.trim()) {
                    errMsg += `[STDERR]:\n${fullStderr.trim()}`;
                } else if (fullStdout.trim()) {
                    const lines = fullStdout.trim().split('\n');
                    errMsg += `[ERROR TRACE]:\n${lines.slice(-15).join('\n')}`;
                }
                reject(new Error(errMsg));
                return;
            }

            let data: any;
            try {
                const configContent = fs.readFileSync(outputFilePath, 'utf8');
                data = JSON.parse(configContent);
            } catch (err) {
                console.error(`Failed to read or parse JSON from ${outputFilePath}:`, err);
                brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM ERROR] Failed to parse output file: ${err}\n` });
                reject(new Error(`Failed to read/parse output file: ${err}`));
                return;
            }
            console.log(`Finished reading data from ${outputFilePath}.`);

                console.log(`Now starting to write data into vscode globalState ${vscodeContextStateName}`);
                context.globalState.update(vscodeContextStateName, data);
                console.log(`Finished write into vscode globalState at ${vscodeContextStateName}`);

                console.log(`Start to verify if global context as same as ${outputFilePath} 's content`);
                const readNewGlobalStateData = context.globalState.get(vscodeContextStateName);
                if (JSON.stringify(data) !== JSON.stringify(readNewGlobalStateData)) {
                    console.error(`
                    runTerminalCommand raises error: fail to compare ${outputFilePath} 's content and vscode.globalState.${vscodeContextStateName} 's data, they are not equal!

                    The data from ${outputFilePath} is: ${JSON.stringify(data)}
                    The data from ${vscodeContextStateName} is: ${JSON.stringify(readNewGlobalStateData)}
                    `);
                    reject(new Error(`Data verification failed for ${vscodeContextStateName}`));
                    return;
                }
                
                brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Execution finished successfully. JSON parsed.\n` });
                console.log(`Successfully update data from ${outputFilePath}, to vscode.globalState.${vscodeContextStateName}`);
                resolve(data);
        });
    });
}