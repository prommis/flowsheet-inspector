/**
 * Fallback Python interpreter selection for when the Microsoft Python
 * extension (`ms-python.python`) is NOT installed.
 *
 * Some users (e.g. conda users) do not want to install the Python extension,
 * so we cannot rely on it as a hard dependency. When it is absent, this module
 * provides:
 *   - discovery of interpreter candidates (conda envs, workspace venvs,
 *     CONDA_PREFIX, PATH pythons)
 *   - a QuickPick UI to choose one (with a manual-path escape hatch)
 *   - persistence of the choice in the extension's global state
 *   - a change event so the rest of the extension can react exactly like it
 *     does to ms-python's interpreter-changed event
 *
 * When ms-python IS installed, none of this is used — `python_env.ts` prefers
 * the official API and this module stays dormant.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isWindows } from './platform_config';

/** Global-state key holding the manually selected interpreter path. */
const FALLBACK_INTERPRETER_KEY = 'fi.fallbackInterpreterPath';

/** Extension context stashed at activation so globalState is reachable here. */
let extensionContext: vscode.ExtensionContext | undefined;

/** Fires when the user picks a new interpreter through the fallback picker. */
const fallbackInterpreterChanged = new vscode.EventEmitter<void>();

/**
 * Event that fires when the fallback interpreter selection changes.
 * `python_env.ts` merges this with ms-python's change event so callers get a
 * single "interpreter changed" signal regardless of which mechanism is active.
 */
export const onDidChangeFallbackInterpreter = fallbackInterpreterChanged.event;

/**
 * Stores the extension context so this module can read/write global state.
 * Must be called once from `activate()` before any other function here.
 *
 * @param context The extension context from `activate()`.
 */
export function initPythonEnvFallback(context: vscode.ExtensionContext): void {
    extensionContext = context;
}

/**
 * Returns the interpreter to use when ms-python is not installed.
 *
 * Resolution order:
 *   1. The path the user picked via the fallback QuickPick (persisted in
 *      global state), if it still exists on disk.
 *   2. The python of the conda env VS Code was launched from, if any
 *      (`$CONDA_PREFIX` is set when VS Code is started from an activated
 *      conda shell).
 *
 * @returns Absolute interpreter path, or `undefined` if nothing usable found.
 */
export function getFallbackInterpreterPath(): string | undefined {
    const saved = extensionContext?.globalState.get<string>(FALLBACK_INTERPRETER_KEY);
    if (saved && fs.existsSync(saved)) {
        return saved;
    }
    const condaPrefix = process.env.CONDA_PREFIX;
    if (condaPrefix) {
        const python = interpreterInPrefix(condaPrefix);
        if (fs.existsSync(python)) {
            return python;
        }
    }
    return undefined;
}

/** One interpreter candidate offered by the fallback QuickPick. */
export interface IInterpreterCandidate {
    /** Absolute path to the python executable. */
    interpreterPath: string;
    /** Short display name (usually the env folder name). */
    name: string;
    /** Where the candidate came from, e.g. "conda", "venv", "PATH". */
    source: string;
}

/**
 * Builds the path of the python executable inside an environment prefix.
 *
 * @param prefix Environment root directory.
 * @returns `<prefix>/bin/python` on Unix, `<prefix>\python.exe` on Windows
 *          (conda layout; venv Scripts layout is checked by the caller).
 */
function interpreterInPrefix(prefix: string): string {
    return isWindows()
        ? path.join(prefix, 'python.exe')
        : path.join(prefix, 'bin', 'python');
}

/**
 * Lists likely conda installation roots on this machine.
 *
 * A "root" is the base install of a conda distribution (anaconda3,
 * miniconda3, miniforge3, mambaforge, micromamba, ...) — its named envs
 * live in `<root>/envs/`. Roots are derived from, in order:
 *   - `$CONDA_EXE` (points at `<root>/bin/conda` or `<root>\Scripts\conda.exe`)
 *   - `$CONDA_PREFIX` (the active env: either the root itself for base, or
 *     `<root>/envs/<name>` for a named env)
 *   - a conda executable found on PATH
 *   - well-known install locations (home dir, /opt, Homebrew Caskroom,
 *     C:\ProgramData)
 *
 * A candidate is kept only if it actually looks like a conda root (has a
 * `conda-meta/` folder or an `envs/` subdirectory).
 *
 * @returns Absolute root directories, deduplicated, possibly empty.
 */
function condaRootCandidates(): string[] {
    const roots = new Set<string>();

    /**
     * Records a directory if it exists and looks like a conda root.
     *
     * @param root Candidate root directory.
     */
    const addRoot = (root: string | undefined) => {
        if (!root) {
            return;
        }
        const normalized = path.resolve(root);
        if (roots.has(normalized)) {
            return;
        }
        if (
            fs.existsSync(path.join(normalized, 'conda-meta')) ||
            fs.existsSync(path.join(normalized, 'envs'))
        ) {
            roots.add(normalized);
        }
    };

    /**
     * Derives the root from a conda executable path (two levels up from
     * `bin/conda`, `Scripts\conda.exe`, or `condabin\conda.bat`).
     *
     * @param exe Absolute path to a conda executable.
     */
    const addRootFromCondaExe = (exe: string | undefined) => {
        if (exe) {
            addRoot(path.dirname(path.dirname(exe)));
        }
    };

    addRootFromCondaExe(process.env.CONDA_EXE);

    const condaPrefix = process.env.CONDA_PREFIX;
    if (condaPrefix) {
        addRoot(
            path.basename(path.dirname(condaPrefix)) === 'envs'
                ? path.dirname(path.dirname(condaPrefix))
                : condaPrefix,
        );
    }

    // conda executable on PATH
    const condaExeNames = isWindows() ? ['conda.exe', 'conda.bat'] : ['conda'];
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
        if (!dir) {
            continue;
        }
        for (const exe of condaExeNames) {
            const exePath = path.join(dir, exe);
            if (fs.existsSync(exePath)) {
                addRootFromCondaExe(exePath);
            }
        }
    }

    // Well-known install locations
    const home = os.homedir();
    const distros = ['anaconda3', 'miniconda3', 'miniforge3', 'mambaforge', 'micromamba'];
    const parents = [home, ...(isWindows() ? ['C:\\ProgramData'] : ['/opt', '/usr/local'])];
    for (const parent of parents) {
        for (const distro of distros) {
            addRoot(path.join(parent, distro));
        }
    }
    if (!isWindows()) {
        for (const caskroom of ['/opt/homebrew/Caskroom', '/usr/local/Caskroom']) {
            for (const distro of ['miniconda', 'miniforge']) {
                addRoot(path.join(caskroom, distro, 'base'));
            }
        }
    }

    return [...roots];
}

/**
 * Reads custom environment directories (`envs_dirs`) from `~/.condarc`.
 *
 * Minimal YAML handling on purpose (no dependency): finds the `envs_dirs:`
 * block and collects its `- <path>` list entries until the next top-level
 * key. Quotes are stripped and a leading `~` expands to the home directory.
 *
 * @returns Absolute env-directory paths, possibly empty.
 */
function envsDirsFromCondarc(): string[] {
    const result: string[] = [];
    try {
        const lines = fs
            .readFileSync(path.join(os.homedir(), '.condarc'), 'utf-8')
            .split('\n');
        let inBlock = false;
        for (const raw of lines) {
            const line = raw.replace(/#.*$/, '').trimEnd();
            if (!line.trim()) {
                continue;
            }
            if (/^envs_dirs\s*:/.test(line)) {
                inBlock = true;
                continue;
            }
            if (!inBlock) {
                continue;
            }
            const entry = line.match(/^\s*-\s*(.+)$/);
            if (!entry) {
                // A new top-level key ends the envs_dirs block
                if (!/^\s/.test(line)) {
                    inBlock = false;
                }
                continue;
            }
            let dir = entry[1].trim().replace(/^['"]|['"]$/g, '');
            if (dir.startsWith('~')) {
                dir = path.join(os.homedir(), dir.slice(1));
            }
            result.push(dir);
        }
    } catch {
        // No .condarc — fine.
    }
    return result;
}

/**
 * Discovers Python interpreter candidates without the ms-python extension.
 *
 * Sources, in order:
 *   - conda roots found on this machine (see {@link condaRootCandidates}):
 *     the base env plus everything under `<root>/envs/`
 *   - custom `envs_dirs` from `~/.condarc`
 *   - conda environments listed in `~/.conda/environments.txt` (best-effort
 *     registry — mamba/miniforge sometimes skip it, hence the scans above)
 *   - the currently activated conda env (`$CONDA_PREFIX`), if any
 *   - `.venv` / `venv` folders in each workspace root
 *   - the first `python3` / `python` found on PATH
 *
 * Results are deduplicated by interpreter path and filtered to executables
 * that actually exist on disk.
 *
 * @returns Candidate list, possibly empty.
 */
export function discoverInterpreterCandidates(): IInterpreterCandidate[] {
    const candidates: IInterpreterCandidate[] = [];
    const seen = new Set<string>();

    /**
     * Adds a candidate if its interpreter exists and was not already added.
     *
     * @param interpreterPath Absolute path to the python executable.
     * @param name Display name for the QuickPick.
     * @param source Origin label ("conda", "venv", "PATH", …).
     */
    const add = (interpreterPath: string, name: string, source: string) => {
        if (!interpreterPath || seen.has(interpreterPath) || !fs.existsSync(interpreterPath)) {
            return;
        }
        seen.add(interpreterPath);
        candidates.push({ interpreterPath, name, source });
    };

    // Conda envs from scanning install roots directly — most reliable source;
    // environments.txt alone misses envs on some setups (e.g. mamba/miniforge)
    const envsDirs: string[] = [];
    for (const root of condaRootCandidates()) {
        add(interpreterInPrefix(root), 'base', `conda (${path.basename(root)})`);
        envsDirs.push(path.join(root, 'envs'));
    }
    envsDirs.push(...envsDirsFromCondarc());
    for (const envsDir of envsDirs) {
        let children: string[] = [];
        try {
            children = fs.readdirSync(envsDir);
        } catch {
            continue;
        }
        for (const child of children) {
            add(interpreterInPrefix(path.join(envsDir, child)), child, 'conda');
        }
    }

    // Conda envs from ~/.conda/environments.txt (same location on all OSes)
    const envsFile = path.join(os.homedir(), '.conda', 'environments.txt');
    try {
        const lines = fs.readFileSync(envsFile, 'utf-8').split('\n');
        for (const line of lines) {
            const prefix = line.trim();
            if (!prefix) {
                continue;
            }
            add(interpreterInPrefix(prefix), path.basename(prefix), 'conda');
        }
    } catch {
        // No conda or no environments.txt — fine, other sources may hit.
    }

    // Env VS Code was launched from (activated conda shell)
    if (process.env.CONDA_PREFIX) {
        add(
            interpreterInPrefix(process.env.CONDA_PREFIX),
            path.basename(process.env.CONDA_PREFIX),
            'conda (active shell)',
        );
    }

    // Workspace-local virtualenvs
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const venvDir of ['.venv', 'venv']) {
            const prefix = path.join(folder.uri.fsPath, venvDir);
            const python = isWindows()
                ? path.join(prefix, 'Scripts', 'python.exe')
                : path.join(prefix, 'bin', 'python');
            add(python, `${venvDir} (${folder.name})`, 'venv');
        }
    }

    // First python on PATH
    const exeNames = isWindows() ? ['python.exe'] : ['python3', 'python'];
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
        // Skip the Microsoft Store execution-alias stub: WindowsApps\python.exe
        // exists on every Windows box but just opens the Store when run.
        if (!dir || /WindowsApps/i.test(dir)) {
            continue;
        }
        for (const exe of exeNames) {
            add(path.join(dir, exe), exe, 'PATH');
        }
    }

    return candidates;
}

/**
 * Shows our own interpreter QuickPick (used only when ms-python is absent).
 *
 * Lists everything from {@link discoverInterpreterCandidates} plus an
 * "Enter interpreter path..." item that opens an input box with on-the-fly
 * existence validation. The chosen path is persisted in global state and
 * {@link onDidChangeFallbackInterpreter} fires, which triggers the same
 * refresh path as ms-python's interpreter-changed event (re-run fi-steps,
 * update the sidebar display).
 *
 * @returns The selected interpreter path, or `undefined` if dismissed.
 */
export async function showFallbackInterpreterPicker(): Promise<string | undefined> {
    const manualItem: vscode.QuickPickItem = {
        label: '$(edit) Enter interpreter path...',
        alwaysShow: true,
    };
    const current = getFallbackInterpreterPath();
    const items: vscode.QuickPickItem[] = discoverInterpreterCandidates().map((c) => ({
        label: c.name,
        description: c.source + (c.interpreterPath === current ? ' — current' : ''),
        detail: c.interpreterPath,
    }));
    items.push(manualItem);

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Select Python Interpreter (Flowsheet Inspector)',
        placeHolder: 'Pick the environment that has Flowsheet Inspector (idaes-fi) installed',
        matchOnDetail: true,
        matchOnDescription: true,
    });
    if (!picked) {
        return undefined;
    }

    let interpreterPath: string | undefined;
    if (picked === manualItem) {
        interpreterPath = await vscode.window.showInputBox({
            title: 'Python interpreter path',
            prompt: 'Absolute path to a python executable (e.g. /opt/miniconda3/envs/myenv/bin/python)',
            value: current ?? '',
            validateInput: (value) =>
                value.trim() && fs.existsSync(value.trim()) ? undefined : 'File not found',
        });
        interpreterPath = interpreterPath?.trim();
    } else {
        interpreterPath = picked.detail;
    }
    if (!interpreterPath) {
        return undefined;
    }

    await extensionContext?.globalState.update(FALLBACK_INTERPRETER_KEY, interpreterPath);
    fallbackInterpreterChanged.fire();
    return interpreterPath;
}
