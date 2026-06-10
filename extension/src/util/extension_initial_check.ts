import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { IExtensionConfig } from '../interface';
import { isWindows, buildCommandChain, getDefaultShellConfig } from './platform_config';
import { getActivePythonEnv, activatedProcessEnv } from './python_env';

let lastCheckedConfigStr = "";
let lastCheckResult: { success: boolean; errorMsg?: string } | null = null;

/**
 * Verifies the Python environment VS Code currently has selected can run the
 * flowsheet tools — using the interpreter directly (no shell / conda activate).
 *
 * Performs three checks, stopping at the first failure:
 * 1. an interpreter is selected (Python extension active and configured)
 * 2. `import idaes` succeeds in that interpreter
 * 3. `import idaes_fi` succeeds in that interpreter
 *
 * Runs before fi-steps so the user gets a targeted, actionable message
 * ("install X or pick a different interpreter") instead of a raw spawn error.
 *
 * @param resource Optional file/workspace URI for per-folder interpreter
 *                 resolution in multi-root workspaces.
 * @returns `{ success: true }` when all checks pass, otherwise
 *          `{ success: false, errorMsg }` where `errorMsg` names the failed
 *          check, the environment, and how to fix it (shown in the tree view).
 */
export async function checkActivePythonEnv(resource?: vscode.Uri): Promise<{ success: boolean; errorMsg?: string }> {
    const env = await getActivePythonEnv(resource);
    if (!env) {
        return {
            success: false,
            errorMsg: 'No Python interpreter selected. Use "Python: Select Interpreter" (bottom-right status bar) to pick the environment with Flowsheet Inspector installed.',
        };
    }

    const childEnv = activatedProcessEnv(env);
    const runImport = (module: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            cp.execFile(env.interpreterPath, ['-c', `import ${module}`], { windowsHide: true, env: childEnv }, (error, _stdout, stderr) => {
                if (error) { reject(new Error(stderr || error.message)); } else { resolve(); }
            });
        });
    };

    try {
        await runImport('idaes');
    } catch {
        return { success: false, errorMsg: `IDAES is not installed in the selected environment (${env.name ?? env.interpreterPath}).\nInstall it, or pick a different interpreter.` };
    }
    try {
        await runImport('idaes_fi');
    } catch {
        return { success: false, errorMsg: `'idaes-fi' is missing in the selected environment (${env.name ?? env.interpreterPath}).\nRun 'pip install idaes-fi', or pick a different interpreter.` };
    }

    return { success: true };
}

/**
 * Check if a shell executable exists on the system.
 * - Unix: uses fs.existsSync (absolute path like /bin/zsh)
 * - Windows: uses `where` command to check if it's in PATH (e.g. powershell.exe)
 */
function shellExists(shell: string): Promise<boolean> {
    if (!isWindows()) {
        return Promise.resolve(fs.existsSync(shell));
    }
    // On Windows, shell is typically just a name like 'powershell.exe' that lives in PATH
    return new Promise((resolve) => {
        cp.exec(`where ${shell}`, { windowsHide: true }, (error) => {
            resolve(!error);
        });
    });
}

/**
 * Perform a 4-step sanity check on the user's environment configuration.
 * Caches the result based on the config object to prevent freezing the UI on rapid tab switches.
 * @param config The extension configuration containing shell, source_cmd, activate_command
 * @param force If true, bypasses the cache and forces a re-check
 * @returns An object with success state and an error message if failed
 */
export async function checkExtensionConfigEnv(config: IExtensionConfig, force = false): Promise<{ success: boolean; errorMsg?: string }> {
    const configStr = JSON.stringify(config);
    if (!force && lastCheckedConfigStr === configStr && lastCheckResult) {
        return lastCheckResult;
    }

    const defaultConfig = getDefaultShellConfig();
    const shell = config.shell || defaultConfig.shell;
    const sourceCmd = config.sorce_treminal;
    const activateCmd = config.activate_command;

    // 1. Check Shell
    const shellFound = await shellExists(shell);
    if (!shellFound) {
        lastCheckResult = { success: false, errorMsg: `[Step 1/4 Failed] Shell not found: ${shell}. Please check your extension config.` };
        lastCheckedConfigStr = configStr;
        return lastCheckResult;
    }

    const execPromise = (cmd: string): Promise<{ stdout: string; stderr: string }> => {
        return new Promise((resolve, reject) => {
            cp.exec(cmd, { shell, windowsHide: true }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    };

    // 2. Check Environment Activation
    try {
        await execPromise(buildCommandChain([sourceCmd, activateCmd]));
    } catch (e: any) {
        lastCheckResult = { success: false, errorMsg: `[Step 2/4 Failed] Could not activate environment.\nCommand: ${activateCmd}\nError: ${e.message.trim()}` };
        lastCheckedConfigStr = configStr;
        return lastCheckResult;
    }

    // 3. Check IDAES
    try {
        await execPromise(buildCommandChain([sourceCmd, activateCmd, 'python -c "import idaes"']));
    } catch (e: any) {
        lastCheckResult = { success: false, errorMsg: `[Step 3/4 Failed] IDAES is not installed in the target environment.\nPlease install IDAES via your terminal.` };
        lastCheckedConfigStr = configStr;
        return lastCheckResult;
    }

    // 4. Check idaes-fi
    try {
        await execPromise(buildCommandChain([sourceCmd, activateCmd, 'python -c "import idaes_fi"']));
    } catch (e: any) {
        lastCheckResult = { success: false, errorMsg: `[Step 4/4 Failed] 'idaes-fi' package is missing.\nPlease run 'pip install idaes-fi' in your environment.` };
        lastCheckedConfigStr = configStr;
        return lastCheckResult;
    }

    lastCheckResult = { success: true };
    lastCheckedConfigStr = configStr;
    return lastCheckResult;
}
