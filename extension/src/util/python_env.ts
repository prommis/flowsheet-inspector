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
import { brodcastMessage } from './webview_handler';

/** One entry in the Python extension's list of discovered environments. */
interface IKnownEnvironment {
    id: string;
    path: string;
    environment?: { type?: string; folderUri?: vscode.Uri; name?: string };
    executable?: { uri?: vscode.Uri };
}

/** Minimal shape of the bits of the Python extension API we use. */
interface IPythonEnvApi {
    environments: {
        getActiveEnvironmentPath(resource?: vscode.Uri): { id: string; path: string };
        resolveEnvironment(env: { id: string; path: string } | string): Promise<{
            executable: { uri?: vscode.Uri; sysPrefix?: string };
            environment?: { type?: string; folderUri?: vscode.Uri; name?: string };
        } | undefined>;
        onDidChangeActiveEnvironmentPath: vscode.Event<{ id: string; path: string; resource?: vscode.Uri }>;
        onDidChangeEnvironments: vscode.Event<unknown>;
        readonly known: readonly IKnownEnvironment[];
        refreshEnvironments(): Promise<void>;
        updateActiveEnvironmentPath(environmentPath: string, resource?: vscode.Uri): Promise<void>;
    };
}

/**
 * Locates and returns the VS Code Python extension's public API.
 *
 * Looks up the `ms-python.python` extension and activates it if it hasn't
 * been activated yet (activation is required before `exports` is populated).
 * All other helpers in this file go through this function so the activation
 * handshake lives in one place.
 *
 * @returns The Python extension API, or `undefined` if the extension is not
 *          installed (should not happen in practice — it is declared in
 *          `extensionDependencies` — but callers still handle it defensively).
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
 * Fires whenever the active interpreter changes, regardless of how it was
 * changed — via the VS Code status-bar picker, the "Python: Select
 * Interpreter" command, or our own {@link setActivePythonEnv}. Used to re-run
 * fi-steps and refresh the tree view whenever the user switches environment.
 *
 * @param listener Callback invoked (with no arguments) on every interpreter change.
 * @returns A Disposable that unsubscribes the listener (push it onto
 *          `context.subscriptions`), or `undefined` if the Python extension
 *          is unavailable.
 */
export async function onDidChangeActivePythonEnv(listener: () => void): Promise<vscode.Disposable | undefined> {
    const api = await getPythonApi();
    if (!api?.environments?.onDidChangeActiveEnvironmentPath) {
        return undefined;
    }
    return api.environments.onDidChangeActiveEnvironmentPath(() => listener());
}

/**
 * Subscribes to changes in the *set* of Python environments VS Code knows about.
 *
 * Environment discovery is asynchronous: after the Python extension activates,
 * environments "trickle in" one event at a time as the machine is scanned.
 * Listening to this lets the UI fill its environment dropdown progressively
 * instead of showing only whatever was discovered at first render. Callers
 * should debounce, as discovery can fire many events in a short burst.
 *
 * @param listener Callback invoked (with no arguments) each time an
 *                 environment is added, removed, or updated.
 * @returns A Disposable that unsubscribes the listener (push it onto
 *          `context.subscriptions`), or `undefined` if the Python extension
 *          is unavailable.
 */
export async function onDidChangeKnownPythonEnvs(listener: () => void): Promise<vscode.Disposable | undefined> {
    const api = await getPythonApi();
    if (!api?.environments?.onDidChangeEnvironments) {
        return undefined;
    }
    return api.environments.onDidChangeEnvironments(() => listener());
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
 * activation: the interpreter path, the env prefix (root folder), the bin/
 * Scripts directory holding console-script entry points (fi-steps, fi-run),
 * and the PATH segments a child process needs for compiled dependencies
 * (numpy/scipy DLLs on Windows) to load — i.e. what `conda activate` would
 * have put on PATH.
 *
 * @param resource Optional file/workspace URI; in multi-root workspaces the
 *                 selected interpreter can differ per folder, so pass the
 *                 flowsheet file when available.
 * @returns The resolved environment, or `undefined` if the Python extension
 *          is not installed or no interpreter has been selected yet.
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
 * Builds the absolute path to a console-script entry point installed in the
 * given environment (e.g. `fi-steps`, `fi-run`).
 *
 * Pip installs console scripts into `<prefix>/bin` on Unix and
 * `<prefix>\Scripts` on Windows; this resolves into that directory and adds
 * the `.exe` suffix on Windows. The result is passed directly to
 * `child_process.spawn` — no shell or PATH lookup involved.
 *
 * @param env  The environment resolved by {@link getActivePythonEnv}.
 * @param tool The console-script name without extension, e.g. `"fi-steps"`.
 * @returns Absolute path to the tool's executable inside the environment.
 */
export function pythonToolPath(env: IResolvedPythonEnv, tool: string): string {
    return path.join(env.binDir, isWindows() ? `${tool}.exe` : tool);
}

/**
 * Builds the environment-variable map for spawning a tool from a Python env,
 * mimicking what `conda activate` / venv activation would do to PATH.
 *
 * Takes the current process env and prepends the environment's directories
 * (bin/Scripts, plus conda's `Library\bin` etc. on Windows) to PATH so that
 * the spawned tool and its compiled dependencies (DLLs on Windows, shared
 * libs on Unix) resolve correctly. Looks up the existing PATH key
 * case-insensitively because Windows uses `Path` while Unix uses `PATH`.
 *
 * @param env The environment resolved by {@link getActivePythonEnv}.
 * @returns A copy of `process.env` with the environment's dirs prepended to
 *          PATH, ready to pass as `options.env` to `child_process.spawn`.
 */
export function activatedProcessEnv(env: IResolvedPythonEnv): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = { ...process.env };
    const sep = path.delimiter;
    const prepend = env.pathPrepend.join(sep);
    const pathKey = Object.keys(result).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    result[pathKey] = prepend + sep + (result[pathKey] ?? '');
    return result;
}

/** A Python environment entry for display in the UI. */
export interface IPythonEnvListItem {
    id: string;
    /** Interpreter path — used as the <option> value and for switching. */
    path: string;
    /** Human-readable label, e.g. "test-idaes-extension (Conda)". */
    label: string;
}

/**
 * Derives a short human-readable label for an environment, for UI display.
 *
 * Prefers the name reported by the Python extension (e.g. the conda env
 * name). When no name is available (common for venvs and global installs),
 * falls back to a folder name derived from the interpreter path:
 * `<prefix>/bin/python` → `<prefix>`'s folder name on Unix,
 * `<prefix>\python.exe` → `<prefix>`'s folder name on Windows. The manager
 * type, when known, is appended in parentheses.
 *
 * @param name            Environment name from the Python extension, if any.
 * @param type            Environment manager type (e.g. "Conda"), if known.
 * @param interpreterPath Absolute interpreter path used for the fallback.
 * @returns A label like `"test-idaes-extension (Conda)"` or `"myenv"`.
 */
function envDisplayLabel(name: string | undefined, type: string | undefined, interpreterPath: string): string {
    let base = name;
    if (!base) {
        // Derive from the path: <prefix>/bin/python → <prefix> folder name,
        // <prefix>\python.exe → <prefix> folder name, otherwise the path itself.
        const dir = path.dirname(interpreterPath);
        base = path.basename(dir) === 'bin' ? path.basename(path.dirname(dir)) : path.basename(dir);
    }
    return type ? `${base} (${type})` : base;
}

/**
 * Lists every Python environment VS Code has discovered, plus the active one.
 *
 * Backs the "Current Python" dropdown in the tree view. If the Python
 * extension hasn't discovered any environments yet (typical right after
 * activation — discovery is async), this forces a `refreshEnvironments()`
 * pass first so the very first render isn't empty. If the active interpreter
 * is somehow not in the discovered list, it is prepended so the dropdown can
 * always show the current selection.
 *
 * @param resource Optional file/workspace URI for per-folder interpreter
 *                 resolution in multi-root workspaces.
 * @returns `current` — the active environment (or `null` if none selected),
 *          and `envs` — every discovered environment, labeled for display.
 */
export async function listPythonEnvs(resource?: vscode.Uri): Promise<{ current: IPythonEnvListItem | null; envs: IPythonEnvListItem[] }> {
    const api = await getPythonApi();
    if (!api?.environments) {
        return { current: null, envs: [] };
    }

    // On first activation the Python extension may not have discovered any
    // environments yet — force a discovery pass so the UI doesn't start empty.
    if (api.environments.known.length === 0) {
        try {
            await api.environments.refreshEnvironments();
        } catch (e) {
            console.error(`refreshEnvironments failed: ${e}`);
        }
    }

    const envs: IPythonEnvListItem[] = api.environments.known.map((e) => ({
        id: e.id,
        path: e.executable?.uri?.fsPath ?? e.path,
        label: envDisplayLabel(e.environment?.name, e.environment?.type, e.executable?.uri?.fsPath ?? e.path),
    }));

    const activePath = api.environments.getActiveEnvironmentPath(resource);
    let current: IPythonEnvListItem | null = null;
    if (activePath?.path) {
        const found = envs.find((e) => e.id === activePath.id || e.path === activePath.path);
        current = found
            ?? { id: activePath.id, path: activePath.path, label: envDisplayLabel(undefined, undefined, activePath.path) };
        // Keep the dropdown consistent: the active env must be selectable
        if (!found) {
            envs.unshift(current);
        }
    }

    return { current, envs };
}

/**
 * Switches VS Code's selected Python interpreter programmatically.
 *
 * Equivalent to the user picking an interpreter from the status bar — VS Code
 * persists the choice and fires `onDidChangeActiveEnvironmentPath`, which our
 * listener (see activate_tab_handler) uses to re-run fi-steps and refresh the
 * env list. Called when the user picks an environment from the tree view's
 * "Current Python" dropdown, keeping the dropdown and the status bar in sync.
 *
 * @param interpreterPath Absolute path to the interpreter to select (the
 *                        `path` of an {@link IPythonEnvListItem}).
 * @throws If the Python extension API is unavailable.
 */
export async function setActivePythonEnv(interpreterPath: string): Promise<void> {
    const api = await getPythonApi();
    if (!api?.environments?.updateActiveEnvironmentPath) {
        throw new Error('Python extension API unavailable — cannot switch interpreter.');
    }
    await api.environments.updateActiveEnvironmentPath(interpreterPath);
}

/**
 * Pushes the current interpreter + full environment list to all webviews.
 *
 * Gathers data via {@link listPythonEnvs} and broadcasts a
 * `python_env_update` message, which the React side stores in context and the
 * tree view renders as the "Current Python" selector. Called when a webview
 * signals `ready`, when the user switches interpreter, and (debounced) as
 * environment discovery progresses.
 *
 * @param resource Optional file/workspace URI for per-folder interpreter
 *                 resolution in multi-root workspaces.
 */
export async function broadcastPythonEnvUpdate(resource?: vscode.Uri): Promise<void> {
    const { current, envs } = await listPythonEnvs(resource);
    brodcastMessage({
        type: 'python_env_update',
        current,
        envs,
        time: new Date().toISOString(),
    });
}

/**
 * Triggers a Python environment re-discovery pass without blocking the caller.
 *
 * On Windows (and on first install generally), the Python extension may finish
 * its initial environment scan before our sidebar webview is registered, so
 * the onDidChangeEnvironments events are lost. Calling this after the webview
 * is ready forces a new scan, which re-fires those events and lets the
 * debounced listener in activate_tab_handler push the updated list to the UI.
 */
export async function triggerPythonEnvRefresh(): Promise<void> {
    const api = await getPythonApi();
    if (api?.environments?.refreshEnvironments) {
        await api.environments.refreshEnvironments();
    }
}
