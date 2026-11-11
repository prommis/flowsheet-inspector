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
import { getIfiPythonArgs } from './run_terminal_command';

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
 * @throws If no interpreter is selected, if fi-steps exits non-zero (the
 *         error includes stderr/stdout details), or if no JSON array can be
 *         found in the output.
 */
export async function getFlowsheetSteps(fileName: string): Promise<IFiStepsResult> {
    const env = await getActivePythonEnv(fileName ? vscode.Uri.file(fileName) : undefined);
    if (!env) {
        throw new Error(NO_INTERPRETER_MSG);
    }

    return new Promise<IFiStepsResult>((resolve, reject) => {
        const ifiArgs = ['--json', 'flowsheet', 'steps', '-f', fileName]
        const args = getIfiPythonArgs(ifiArgs);
        const child = cp.spawn(
            env.interpreterPath,
            args,
            {
                stdio: 'pipe',
                windowsHide: true,
                env: activatedProcessEnv(env),
            },
        );

        let stdout = '';
        let stderr = '';
        const trim_output = (o: string) => o.trim().slice(0, 500);
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                const errDetail = stderr.trim() || stdout.trim() || '(no output)';
                reject(new Error(`Getting flowsheet steps failed (exit ${code}) python-args=[[ ${args} ]]: ${errDetail}`));
                return;
            }
            // Parse JSON output of the `flowsheet steps` command
            let errMessage = '';
            let parsedSteps: string[] = [];
            const lines = stdout.trim().split('\n');
            const jsonLine = lines.reverse().find((s) => s.trim().startsWith('{'));
            if (!jsonLine) {
                errMessage = `No JSON object found in output python-args=[[ ${args} ]] to get flowsheet steps.`;
            }
            else {
                try {
                    parsedSteps = JSON.parse(jsonLine.trim());
                } catch (e) {
                    errMessage = `Failed to parse JSON object from output python-args=[[ ${args} ]] to get flowsheet steps.`;
                }
            }
            if (errMessage != '') {
                reject(new Error([errMessage, 
                `STDOUT: ${trim_output(stdout)}`, 
                `STDERR: ${trim_output(stderr)}`].join('\n')));
                return;
            }
            resolve({ classname: 'FlowsheetRunner', steps: parsedSteps });
        });
    });
}
