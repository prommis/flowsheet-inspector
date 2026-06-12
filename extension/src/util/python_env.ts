/**
 * Resolves the Python environment the user has selected in VS Code, via the
 * official Python extension (`ms-python.python`) API.
 *
 * We only read the currently-active interpreter — switching is intentionally
 * left to VS Code's own "Python: Select Interpreter" status-bar command so we
 * don't have to maintain a parallel environment list or fight with VS Code's
 * picker. When the user changes their interpreter we react via
 * {@link onDidChangeActivePythonEnv} and re-run fi-steps automatically.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { isWindows } from './platform_config';
import { brodcastMessage } from './webview_handler';

/** Minimal shape of the bits of the Python extension API we use. */
interface IPythonEnvApi {
    environments: {
        getActiveEnvironmentPath(resource?: vscode.Uri): { id: string; path: string };
        resolveEnvironment(env: { id: string; path: string } | string): Promise<{
            executable: { uri?: vscode.Uri; sysPrefix?: string };
            environment?: { type?: string; folderUri?: vscode.Uri; name?: string };
        } | undefined>;
        onDidChangeActiveEnvironmentPath: vscode.Event<{ id: string; path: string; resource?: vscode.Uri }>;
    };
}

/**
 * Locates and returns the VS Code Python extension's public API.
 *
 * @returns The Python extension API, or `undefined` if the extension is not installed.
 */
async function getPythonApi(): Promise<IPythonEnvApi | undefined> {
    const ext = vscode.extensions.getExtension('ms-python.python');
    if (!ext) {
        return undefined;
    }
    if (!ext.isActive) {
        await ext.activate();
    }
    return ext.exports as IPythonEnvApi;
}

/**
 * Subscribes to "the user changed the selected interpreter" events.
 *
 * Fires whenever the active interpreter changes — via the VS Code status-bar
 * picker or the "Python: Select Interpreter" command. Used to re-run fi-steps
 * and refresh the tree view whenever the user switches environment.
 *
 * @param listener Callback invoked (with no arguments) on every interpreter change.
 * @returns A Disposable to push onto `context.subscriptions`, or `undefined` if
 *          the Python extension is unavailable.
 */
export async function onDidChangeActivePythonEnv(listener: () => void): Promise<vscode.Disposable | undefined> {
    const api = await getPythonApi();
    if (!api?.environments?.onDidChangeActiveEnvironmentPath) {
        return undefined;
    }
    return api.environments.onDidChangeActiveEnvironmentPath(() => listener());
}

export interface IResolvedPythonEnv {
    /** Absolute path to the interpreter (python / python.exe). */
    interpreterPath: string;
    /** Environment prefix (root dir), if known. */
    prefix?: string;
    /** Environment manager type, e.g. "Conda", "VirtualEnvironment", "Pyenv". */
    type?: string;
    /** Display name, if any. */
    name?: string;
    /** Dir that holds console-script entry points (Scripts on Windows, bin on Unix). */
    binDir: string;
    /**
     * PATH segments to prepend to a child process env to mimic activation,
     * so compiled deps (and their DLLs on Windows) resolve correctly.
     */
    pathPrepend: string[];
}

/**
 * Resolves the Python environment the user currently has selected in VS Code.
 *
 * Asks the Python extension for the active interpreter and resolves it into
 * everything needed to run tools from that environment without any shell
 * activation: the interpreter path, the env prefix, the bin/Scripts directory,
 * and the PATH segments a child process needs for compiled dependencies to load.
 *
 * @param resource Optional file/workspace URI for per-folder interpreter
 *                 resolution in multi-root workspaces.
 * @returns The resolved environment, or `undefined` if no interpreter is selected.
 */
export async function getActivePythonEnv(resource?: vscode.Uri): Promise<IResolvedPythonEnv | undefined> {
    const api = await getPythonApi();
    if (!api?.environments?.getActiveEnvironmentPath) {
        return undefined;
    }

    const envPath = api.environments.getActiveEnvironmentPath(resource);
    if (!envPath?.path) {
        return undefined;
    }

    const resolved = await api.environments.resolveEnvironment(envPath);
    const interpreterPath = resolved?.executable?.uri?.fsPath ?? envPath.path;
    const prefix = resolved?.environment?.folderUri?.fsPath
        ?? resolved?.executable?.sysPrefix
        ?? (isWindows() ? path.dirname(interpreterPath) : path.dirname(path.dirname(interpreterPath)));

    const binDir = isWindows() ? path.join(prefix, 'Scripts') : path.join(prefix, 'bin');

    const pathPrepend = isWindows()
        ? [prefix, path.join(prefix, 'Library', 'bin'), path.join(prefix, 'Library', 'mingw-w64', 'bin'), binDir]
        : [binDir];

    return {
        interpreterPath,
        prefix,
        type: resolved?.environment?.type,
        name: resolved?.environment?.name,
        binDir,
        pathPrepend,
    };
}

/**
 * Builds the environment-variable map for spawning a tool from a Python env,
 * mimicking what `conda activate` / venv activation would do to PATH.
 *
 * @param env The environment resolved by {@link getActivePythonEnv}.
 * @returns A copy of `process.env` with the environment's dirs prepended to PATH.
 */
export function activatedProcessEnv(env: IResolvedPythonEnv): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = { ...process.env };
    const sep = path.delimiter;
    const prepend = env.pathPrepend.join(sep);
    const pathKey = Object.keys(result).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    result[pathKey] = prepend + sep + (result[pathKey] ?? '');
    return result;
}

/**
 * Pushes the currently-selected interpreter info to all webviews.
 *
 * Broadcasts a `python_env_update` message with just the current interpreter's
 * path and display name — no environment list. Switching is left to VS Code's
 * own "Python: Select Interpreter" picker. Called on webview `ready` and
 * whenever `onDidChangeActivePythonEnv` fires.
 *
 * @param resource Optional file/workspace URI for per-folder interpreter resolution.
 */
export async function broadcastCurrentPythonEnv(resource?: vscode.Uri): Promise<void> {
    const env = await getActivePythonEnv(resource);
    let current: { path: string; name: string } | null = null;
    if (env) {
        let base = env.name;
        if (!base) {
            const dir = path.dirname(env.interpreterPath);
            base = path.basename(dir) === 'bin' ? path.basename(path.dirname(dir)) : path.basename(dir);
        }
        const name = env.type ? `${base} (${env.type})` : base;
        current = { path: env.interpreterPath, name };
    }
    brodcastMessage({
        type: 'python_env_update',
        current,
        time: new Date().toISOString(),
    });
}
