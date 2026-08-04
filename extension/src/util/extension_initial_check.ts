import * as vscode from 'vscode';
import { getActivePythonEnv } from './python_env';

/**
 * Verifies that VS Code has a Python interpreter selected for the given
 * resource.  This is the only hard gate before fi-steps: if no interpreter is
 * configured the user cannot do anything, so we surface a clear action item.
 *
 * Package presence (idaes-pse, idaes-fi, …) is intentionally NOT checked here
 * — that is handled separately by checkRequiredPackages, which returns
 * non-blocking per-package warnings instead of a single blocking error, giving
 * the user a complete picture of what is missing before fi-steps even runs.
 *
 * @param resource Optional file/workspace URI for per-folder interpreter
 *                 resolution in multi-root workspaces.
 * @returns `{ success: true }` when an interpreter is selected, otherwise
 *          `{ success: false, errorMsg }` with an actionable message.
 */
export async function checkActivePythonEnv(resource?: vscode.Uri): Promise<{ success: boolean; errorMsg?: string }> {
    const env = await getActivePythonEnv(resource);
    if (!env) {
        return {
            success: false,
            errorMsg: 'No Python interpreter selected. Use the interpreter selector in the Flowsheet Inspector sidebar to pick the environment with Flowsheet Inspector installed.',
        };
    }
    return { success: true };
}
