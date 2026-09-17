/**
 * Runs `fi-steps` for a flowsheet file using the Python interpreter the user
 * has selected in VS Code — no shell, no `conda activate`, no config.
 *
 * Shared by the tree view (startup) and the tab-switch handler, which
 * previously duplicated this spawn logic with a config-built shell command.
 */
import * as vscode from 'vscode';
import * as cp from 'child_process';
import { getActivePythonEnv, activatedProcessEnv } from './python_env';
import { parseReportDbCheckFromOutput, type IReportDbCheck } from './report_db_tools';

/**
 * Rejection error for a fi-steps run that exited non-zero. When fi-steps
 * refused to run because of the report DB (exit 3), `dbCheck` carries the
 * check-db-version result it printed, so callers can show the exact DB state
 * without another check.
 */
export class FiStepsError extends Error {
    /** Report DB state printed by fi-steps on its refusal path, if any. */
    dbCheck: IReportDbCheck | null;

    /**
     * @param message Human-readable failure text including captured output.
     * @param dbCheck Parsed check result from stdout, or null when absent.
     */
    constructor(message: string, dbCheck: IReportDbCheck | null = null) {
        super(message);
        this.name = 'FiStepsError';
        this.dbCheck = dbCheck;
    }
}

export interface IFiStepsResult {
    classname: string;
    steps: unknown;
}

const NO_INTERPRETER_MSG =
    'No Python interpreter selected. Pick the environment with Flowsheet Inspector ' +
    'installed via the interpreter selector in the Flowsheet Inspector sidebar.';

/**
 * Runs `fi-steps --fs <file> -t json` and returns the parsed step list.
 *
 * Resolves the interpreter the user selected in VS Code, then spawns the
 * `fi-steps` entry point from that environment directly (with an activated
 * PATH via {@link activatedProcessEnv}) — no shell, no `conda activate`, no
 * reliance on the extension config. Output parsing scans stdout from the end
 * for the line starting with `[`, skipping any log lines tools may print
 * before the JSON array.
 *
 * @param fileName Absolute path to the flowsheet `.py` file to inspect.
 * @returns `{ classname: 'FlowsheetRunner', steps }` where `steps` is the
 *          JSON array produced by fi-steps.
 * @throws If no interpreter is selected, if fi-steps exits non-zero (a
 *         {@link FiStepsError} with stderr/stdout details and, on a report DB
 *         refusal, the parsed DB state), or if no JSON array can be found in
 *         the output.
 */
export async function runFiSteps(fileName: string): Promise<IFiStepsResult> {
    const env = await getActivePythonEnv(fileName ? vscode.Uri.file(fileName) : undefined);
    if (!env) {
        throw new Error(NO_INTERPRETER_MSG);
    }

    return new Promise<IFiStepsResult>((resolve, reject) => {
        const child = cp.spawn(
            env.interpreterPath,
            ['-m', 'idaes_fi.structfs.common', '--fs', fileName, '-t', 'json'],
            {
                stdio: 'pipe',
                windowsHide: true,
                env: activatedProcessEnv(env),
            },
        );

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                const errDetail = stderr.trim() || stdout.trim() || '(no output)';
                // On a report DB refusal fi-steps prints the check JSON as its
                // last stdout line; keep it for the caller.
                reject(new FiStepsError(`fi-steps failed (exit ${code}): ${errDetail}`, parseReportDbCheckFromOutput(stdout)));
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
