/**
 * Resolves the Python environment the user has selected in VS Code, via the
 * official Python extension (`ms-python.python`) API.
 *
 * This lets us run fi-steps / fi-run with the user's chosen interpreter
 * directly — no `conda activate`, no shell init, no PowerShell ExecutionPolicy
 * changes. The Python extension already normalizes conda / venv / pyenv /
 * poetry / global into a single interpreter path, so we get support for ALL
 * environment managers for free and stay in sync with the user's selection.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { isWindows } from './platform_config';

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

/** Returns the Python extension API, activating it if needed. */
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
 * Subscribe to "user changed the selected interpreter" events. Returns a
 * Disposable (or undefined if the Python extension isn't available).
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
 * Returns the active Python environment, or undefined if the Python extension
 * is not installed or no interpreter is selected.
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
        // Fall back to deriving the prefix from the interpreter location.
        ?? (isWindows() ? path.dirname(interpreterPath) : path.dirname(path.dirname(interpreterPath)));

    const binDir = isWindows() ? path.join(prefix, 'Scripts') : path.join(prefix, 'bin');

    // Mimic the PATH changes that `conda activate` / venv activation make, so
    // the env's binaries and their compiled-dependency DLLs are found.
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
 * Full path to a console-script entry point installed in the active env
 * (e.g. fi-steps / fi-run). Adds `.exe` on Windows.
 */
export function pythonToolPath(env: IResolvedPythonEnv, tool: string): string {
    return path.join(env.binDir, isWindows() ? `${tool}.exe` : tool);
}

/**
 * Returns a child-process env that mimics environment activation by prepending
 * the env's dirs to PATH — so the tool's compiled dependencies (and their DLLs
 * on Windows) resolve. Handles the Windows `Path` vs `PATH` casing correctly.
 */
export function activatedProcessEnv(env: IResolvedPythonEnv): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = { ...process.env };
    const sep = path.delimiter;
    const prepend = env.pathPrepend.join(sep);
    const pathKey = Object.keys(result).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    result[pathKey] = prepend + sep + (result[pathKey] ?? '');
    return result;
}
