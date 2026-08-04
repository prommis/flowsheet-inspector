/**
 * Resolves the Python environment the user has selected in VS Code.
 *
 * Two mechanisms, in order of preference:
 *   1. The official Python extension (`ms-python.python`) API, when installed.
 *      We only read the currently-active interpreter — switching is left to
 *      VS Code's own "Python: Select Interpreter" command so we don't fight
 *      with VS Code's picker.
 *   2. Our own fallback (`python_env_fallback.ts`) when ms-python is NOT
 *      installed — some conda users refuse to install it, and it must not be
 *      a hard dependency. The fallback resolves a manually picked interpreter
 *      (or `$CONDA_PREFIX`) into the same {@link IResolvedPythonEnv} shape,
 *      so every caller works identically in both modes.
 *
 * When the interpreter changes (either mechanism) we react via
 * {@link onDidChangeActivePythonEnv} and re-run fi-steps automatically.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { isWindows } from './platform_config';
import { brodcastMessage } from './webview_handler';
import { getFallbackInterpreterPath, onDidChangeFallbackInterpreter } from './python_env_fallback';

/** ID of the VS Code Python extension we integrate with for interpreter selection. */
export const PYTHON_EXTENSION_ID = 'ms-python.python';

/** Global-state key remembering that the user dismissed the install recommendation. */
const PYTHON_EXT_PROMPT_DISMISSED_KEY = 'fi.pythonExtensionPromptDismissed';

/**
 * Whether the VS Code Python extension is currently installed.
 *
 * @returns `true` if `ms-python.python` is present (enabled or not), else `false`.
 */
export function isPythonExtensionInstalled(): boolean {
    return vscode.extensions.getExtension(PYTHON_EXTENSION_ID) !== undefined;
}

/**
 * Recommends (does not force) installing the VS Code Python extension.
 *
 * The extension is a soft dependency: it is what lets the user pick the
 * interpreter/conda env used to run flowsheets. Without it, interpreter
 * resolution degrades gracefully (see {@link getActivePythonEnv} returning
 * `undefined`), so instead of a hard `extensionDependencies` gate we surface a
 * non-blocking notification with an "Install" action.
 *
 * Does nothing if the extension is already installed or the user previously
 * chose "Don't show again" (persisted in global state).
 *
 * @param context Extension context, used to persist the dismissal choice.
 */
export async function recommendPythonExtension(context: vscode.ExtensionContext): Promise<void> {
    if (isPythonExtensionInstalled()) {
        return;
    }
    if (context.globalState.get<boolean>(PYTHON_EXT_PROMPT_DISMISSED_KEY)) {
        return;
    }
    const install = 'Install';
    const dontShow = "Don't show again";
    const choice = await vscode.window.showInformationMessage(
        'Flowsheet Inspector works best with the Python extension (ms-python.python), '
        + 'which lets you pick the interpreter / conda environment used to run flowsheets. Install it?',
        install,
        dontShow,
    );
    if (choice === install) {
        try {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', PYTHON_EXTENSION_ID);
            vscode.window.showInformationMessage(
                'Python extension installed. Use "Python: Select Interpreter" to pick the environment with Flowsheet Inspector installed.',
            );
        } catch (e) {
            // Fall back to opening the Marketplace page if the direct install command is unavailable.
            await vscode.commands.executeCommand('extension.open', PYTHON_EXTENSION_ID);
        }
    } else if (choice === dontShow) {
        await context.globalState.update(PYTHON_EXT_PROMPT_DISMISSED_KEY, true);
    }
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
 * picker / "Python: Select Interpreter" command (ms-python installed), or via
 * our own fallback QuickPick (ms-python absent). Used to re-run fi-steps and
 * refresh the tree view whenever the user switches environment.
 *
 * @param listener Callback invoked (with no arguments) on every interpreter change.
 * @returns A Disposable (covering both event sources) to push onto
 *          `context.subscriptions`.
 */
export async function onDidChangeActivePythonEnv(listener: () => void): Promise<vscode.Disposable> {
    const subscriptions: vscode.Disposable[] = [
        onDidChangeFallbackInterpreter(() => listener()),
    ];
    const api = await getPythonApi();
    if (api?.environments?.onDidChangeActiveEnvironmentPath) {
        subscriptions.push(api.environments.onDidChangeActiveEnvironmentPath(() => listener()));
    }
    return vscode.Disposable.from(...subscriptions);
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
 * Assembles an {@link IResolvedPythonEnv} from an interpreter path and its
 * environment prefix — the shared final step for both resolution mechanisms
 * (ms-python API and fallback).
 *
 * @param interpreterPath Absolute path to the python executable.
 * @param prefix Environment root directory.
 * @param type Environment manager type, if known (e.g. "Conda", "Venv").
 * @param name Display name, if known.
 * @returns The fully populated environment descriptor.
 */
function buildResolvedEnv(
    interpreterPath: string,
    prefix: string,
    type?: string,
    name?: string,
): IResolvedPythonEnv {
    const binDir = isWindows() ? path.join(prefix, 'Scripts') : path.join(prefix, 'bin');

    const pathPrepend = isWindows()
        ? [prefix, path.join(prefix, 'Library', 'bin'), path.join(prefix, 'Library', 'mingw-w64', 'bin'), binDir]
        : [binDir];

    return { interpreterPath, prefix, type, name, binDir, pathPrepend };
}

/**
 * Resolves an interpreter path into an environment WITHOUT the ms-python API.
 *
 * Derives the env prefix from the executable's location (`bin/` or `Scripts/`
 * parent for venv-style layouts, the executable's own directory for Windows
 * conda roots) and sniffs the manager type from on-disk markers
 * (`conda-meta/` → Conda, `pyvenv.cfg` → Venv).
 *
 * @param interpreterPath Absolute path to the python executable.
 * @returns The resolved environment descriptor.
 */
function resolveEnvFromInterpreterPath(interpreterPath: string): IResolvedPythonEnv {
    const parentDir = path.dirname(interpreterPath);
    const parentName = path.basename(parentDir).toLowerCase();
    const prefix = (parentName === 'bin' || parentName === 'scripts')
        ? path.dirname(parentDir)
        : parentDir;

    let type: string | undefined;
    if (fs.existsSync(path.join(prefix, 'conda-meta'))) {
        type = 'Conda';
    } else if (fs.existsSync(path.join(prefix, 'pyvenv.cfg'))) {
        type = 'Venv';
    }

    return buildResolvedEnv(interpreterPath, prefix, type, path.basename(prefix));
}

/**
 * Resolves the Python environment the user currently has selected in VS Code.
 *
 * Prefers the Python extension's active interpreter; when ms-python is not
 * installed, falls back to the interpreter chosen through our own picker (or
 * `$CONDA_PREFIX` — see {@link getFallbackInterpreterPath}). Either way the
 * result contains everything needed to run tools from that environment
 * without any shell activation: the interpreter path, the env prefix, the
 * bin/Scripts directory, and the PATH segments a child process needs for
 * compiled dependencies to load.
 *
 * @param resource Optional file/workspace URI for per-folder interpreter
 *                 resolution in multi-root workspaces (ms-python mode only).
 * @returns The resolved environment, or `undefined` if no interpreter is
 *          selected by either mechanism.
 */
export async function getActivePythonEnv(resource?: vscode.Uri): Promise<IResolvedPythonEnv | undefined> {
    const api = await getPythonApi();
    if (!api?.environments?.getActiveEnvironmentPath) {
        const fallbackPath = getFallbackInterpreterPath();
        return fallbackPath ? resolveEnvFromInterpreterPath(fallbackPath) : undefined;
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

    return buildResolvedEnv(
        interpreterPath,
        prefix,
        resolved?.environment?.type,
        resolved?.environment?.name,
    );
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
