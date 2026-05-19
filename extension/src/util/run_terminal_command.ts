import * as vscode from 'vscode';
import * as cp from 'child_process';
import { brodcastMessage } from './webview_handler';
import { getSpawnArgs, getSpawnOptions } from './platform_config';
/**
 * A helper function to execute a terminal command asynchronously.
 * Runs the given command in the specified shell. Once the command completes,
 * it resolves the Promise. With fi-run, results are written directly to
 * the SQLite database and picked up by the history polling mechanism.
 *
 * @param context - The vscode context
 * @param command - The terminal command to execute (e.g., "source .zshrc && conda activate env && fi-run ...")
 * @param shell - The shell executable path (e.g., "/bin/zsh", "/bin/bash", or "C:\\Windows\\System32\\powershell.exe")
 * @returns A Promise that resolves when the command completes successfully
 */
import * as os from 'os';

export default function runTerminalCommand(context: vscode.ExtensionContext, command: string, shell: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!context) { reject(new Error(`runTerminalCommand requires context as param!`)); return; }
        if (!command) { reject(new Error(`runTerminalCommand requires command as param!`)); return; }
        if (!shell) { reject(new Error(`runTerminalCommand requires shell as param!`)); return; }

        console.log(`
            Starting execute terminal command:
            ${command}
            Terminal environment is:
            ${shell}
            ...
        `);
        // Start execute terminal command
        brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Executing background process via SPAWN...\nCommand: ${command}\nShell: ${shell}\n` });

        const { shell: resolvedShell, args: shellArgs } = getSpawnArgs(shell, command);
        const spawnOptions = {
            ...getSpawnOptions(),
            stdio: 'pipe' as const,
            env: Object.assign({}, process.env, { PYTHONUNBUFFERED: "1", FORCE_COLOR: "1" })
        };
        const child = cp.spawn(resolvedShell, shellArgs, spawnOptions);

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
            console.log(`Finished run shell command with code ${code} and signal ${signal}.`);

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

            // fi-run writes results directly to the SQLite database.
            // The history polling mechanism will pick up the new entry.
            brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] fi-run completed successfully. Results saved to SQLite database.\n` });
            console.log(`fi-run completed successfully.`);
            resolve();
        });
    });
}