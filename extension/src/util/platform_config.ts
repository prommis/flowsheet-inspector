/**
 * Platform-specific configuration and helpers for cross-platform compatibility.
 * 
 * Centralizes all OS-dependent logic (shell args, process management, SQLite CLI,
 * default configs, path handling) so that consuming files stay clean and maintainable.
 * 
 * Supported platforms: macOS (darwin), Linux, Windows (win32)
 */
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';


// ============================================================
// Platform Detection
// ============================================================

export type SupportedPlatform = 'win32' | 'darwin' | 'linux';

export function getPlatform(): SupportedPlatform {
    const p = os.platform();
    if (p === 'win32') return 'win32';
    if (p === 'darwin') return 'darwin';
    return 'linux';
}

export function isWindows(): boolean {
    return getPlatform() === 'win32';
}


// ============================================================
// Shell Execution Helpers
// ============================================================

/**
 * Returns the correct arguments for `cp.spawn(shell, args)` per platform.
 * - Unix:       ['-c', command]
 * - PowerShell: ['-Command', command]
 * - cmd.exe:    ['/c', command]
 */
export function getSpawnArgs(shell: string, command: string): { shell: string; args: string[] } {
    if (isWindows()) {
        const shellLower = shell.toLowerCase();
        if (shellLower.includes('cmd')) {
            return { shell, args: ['/c', command] };
        }
        // Default to PowerShell-style args on Windows (covers powershell.exe and pwsh)
        // -ExecutionPolicy Bypass lets the user's $PROFILE (conda init) load even when
        // the system policy would otherwise block it.
        return { shell, args: ['-ExecutionPolicy', 'Bypass', '-Command', command] };
    }
    return { shell, args: ['-c', command] };
}

/**
 * Returns additional spawn options that differ per platform.
 * - Unix:    `detached: true` so we can kill the process group via negative PID
 * - Windows: NO `detached` (it creates a new console and breaks stdout piping).
 *            We use `taskkill /T` for process tree killing instead.
 */
export function getSpawnOptions(): cp.SpawnOptions {
    if (isWindows()) {
        return { windowsHide: true };
    }
    return { detached: true };
}


// ============================================================
// Command Chain Builder
// ============================================================

/**
 * Joins multiple command parts into a single chain.
 * Empty/falsy parts are automatically filtered out.
 * - Unix:    joined with ` && `
 * - Windows: joined with ` ; ` (PowerShell 5.1 does not support `&&`)
 */
export function buildCommandChain(parts: (string | undefined | null)[]): string {
    const validParts = parts.filter((p): p is string => !!p && p.trim().length > 0);
    if (isWindows()) {
        return validParts.join(' ; ');
    }
    return validParts.join(' && ');
}


// ============================================================
// Process Management
// ============================================================

/**
 * Cross-platform process tree kill.
 * - Unix:    sends SIGKILL to the process group via negative PID
 * - Windows: uses `taskkill /PID <pid> /T /F` to kill the process tree
 */
export function killProcessTree(pid: number): void {
    if (isWindows()) {
        cp.exec(`taskkill /PID ${pid} /T /F`, (err) => {
            if (err) {
                console.error(`Failed to kill process tree on Windows: ${err.message}`);
            }
        });
    } else {
        process.kill(-pid, 'SIGKILL');
    }
}


// ============================================================
// IDAES Database / SQLite Helpers
// ============================================================

/**
 * Returns the cross-platform path to the IDAES data directory.
 * Per IDAES-PSE convention:
 * - macOS / Linux: $HOME/.idaes/
 * - Windows:       %LOCALAPPDATA%\idaes\
 */
export function getIdaesDataDir(): string {
    if (isWindows()) {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        return path.join(localAppData, 'idaes');
    }
    return path.join(os.homedir(), '.idaes');
}

/**
 * Returns the cross-platform path to the IDAES SQLite database.
 */
export function getIdaesDbPath(): string {
    return path.join(getIdaesDataDir(), 'reportdb.sqlite');
}

