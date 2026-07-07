/**
 * Spawns a subprocess directly by absolute executable path and streams its
 * stdout/stderr to all webviews as terminal_log messages.
 *
 * Unlike the old shell-based runner, this never goes through /bin/zsh,
 * /bin/bash, or powershell.exe, so there is no dependency on the user's
 * shell PATH, conda init hooks, or ExecutionPolicy settings.
 */
import * as cp from 'child_process';
import { brodcastMessage } from './webview_handler';
import { getSpawnOptions } from './platform_config';

/**
 * Spawns `executable` with `args` in `childEnv` and streams output to the
 * terminal log panel in all webviews.
 *
 * Process-group kill on Unix (negative-PID SIGKILL) still works because
 * getSpawnOptions() sets `detached: true` on non-Windows.  On Windows,
 * `windowsHide: true` suppresses the console window, and taskkill is used
 * for tree-kill by the kill_process handler.
 *
 * @param executable Absolute path to the executable (e.g. fi-run in env/bin).
 * @param args       Command-line arguments to pass.
 * @param childEnv   Environment variables for the child process — typically
 *                   the result of activatedProcessEnv() with PYTHONUNBUFFERED
 *                   and FORCE_COLOR added.
 * @returns Promise that resolves on exit code 0, rejects on non-zero exit,
 *          spawn error, or user cancellation (CANCELED_BY_USER:<pid>).
 */
export default function runTerminalCommand(
    executable: string,
    args: string[],
    childEnv: NodeJS.ProcessEnv,
): Promise<void> {
    return new Promise((resolve, reject) => {
        brodcastMessage({
            type: 'terminal_log',
            data: `\n[SYSTEM] Spawning process directly (no shell):\n  ${executable} ${args.join(' ')}\n`,
        });

        const child = cp.spawn(executable, args, {
            ...getSpawnOptions(),
            stdio: 'pipe',
            env: childEnv,
        });

        brodcastMessage({ type: 'process_started', pid: child.pid });

        let fullStdout = '';
        let fullStderr = '';

        child.stdout!.on('data', (data) => {
            fullStdout += data.toString();
            brodcastMessage({ type: 'terminal_log', data: data.toString() });
        });

        child.stderr!.on('data', (data) => {
            fullStderr += data.toString();
            brodcastMessage({ type: 'terminal_log', data: data.toString() });
        });

        child.on('error', (error) => {
            console.error(`runTerminalCommand spawn error: ${error}`);
            brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM ERROR] Process failed to spawn: ${error}\n` });
            reject(error);
        });

        child.on('close', (code, signal) => {
            if (signal === 'SIGKILL' || signal === 'SIGTERM' || signal === 'SIGINT') {
                brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Process stopped manually. PID: ${child.pid}\n` });
                reject(new Error(`CANCELED_BY_USER:${child.pid}`));
                return;
            }

            brodcastMessage({
                type: 'terminal_log',
                data: `\n[SYSTEM] Process exited with code ${code}.\nCollected stdout bytes: ${fullStdout.length}\nCollected stderr bytes: ${fullStderr.length}\n`,
            });

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

            brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] fi-run completed successfully. Results saved to SQLite database.\n` });
            resolve();
        });
    });
}
