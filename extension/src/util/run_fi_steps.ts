/**
 * Runs `fi-steps` for a flowsheet file using the Python interpreter the user
 * has selected in VS Code — no shell, no `conda activate`, no config.
 *
 * Shared by the tree view (startup) and the tab-switch handler, which
 * previously duplicated this spawn logic with a config-built shell command.
 */
import * as vscode from 'vscode';
import * as cp from 'child_process';
import { getActivePythonEnv, pythonToolPath, activatedProcessEnv } from './python_env';

export interface IFiStepsResult {
    classname: string;
    steps: unknown;
}

const NO_INTERPRETER_MSG =
    'No Python interpreter selected. Pick the environment with Flowsheet Inspector ' +
    'installed via the Python: Select Interpreter command (bottom-right status bar).';

export async function runFiSteps(fileName: string): Promise<IFiStepsResult> {
    const env = await getActivePythonEnv(fileName ? vscode.Uri.file(fileName) : undefined);
    if (!env) {
        throw new Error(NO_INTERPRETER_MSG);
    }

    const fiSteps = pythonToolPath(env, 'fi-steps');

    return new Promise<IFiStepsResult>((resolve, reject) => {
        const child = cp.spawn(fiSteps, ['--fs', fileName, '-t', 'json'], {
            stdio: 'pipe',
            windowsHide: true,
            env: activatedProcessEnv(env),
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                const errDetail = stderr.trim() || stdout.trim() || '(no output)';
                reject(new Error(`fi-steps failed (exit ${code}): ${errDetail}`));
                return;
            }
            try {
                // fi-steps outputs a JSON array; any leading log lines are skipped
                // by scanning from the end for the line that starts with '['.
                const lines = stdout.trim().split('\n');
                const jsonLine = lines.reverse().find((l) => l.trim().startsWith('['));
                if (!jsonLine) {
                    reject(new Error(`No JSON array found in fi-steps output.\nSTDOUT: ${stdout.trim().slice(0, 500)}\nSTDERR: ${stderr.trim().slice(0, 500)}`));
                    return;
                }
                resolve({ classname: 'FlowsheetRunner', steps: JSON.parse(jsonLine.trim()) });
            } catch (e) {
                reject(new Error(`Failed to parse fi-steps output: ${e}`));
            }
        });
    });
}
