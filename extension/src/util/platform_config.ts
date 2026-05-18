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
import { IExtensionConfig } from '../interface';


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
// Default Extension Config (per-platform)
// ============================================================

/**
 * Returns the default IExtensionConfig appropriate for the current OS.
 * - macOS:  /bin/zsh + source ~/.zshrc
 * - Linux:  /bin/bash + source ~/.bashrc
 * - Windows: powershell.exe, no source needed
 */
export function getDefaultShellConfig(): IExtensionConfig {
    switch (getPlatform()) {
        case 'win32':
            return {
                activate_command: 'conda activate test-idaes-extension',
                sorce_treminal: '',  // Windows doesn't need sourcing a shell profile
                output_file_name: path.join(os.homedir(), 'Documents', 'out1.json'),
                shell: 'powershell.exe'
            };
        case 'darwin':
            return {
                activate_command: 'conda activate test-idaes-extension',
                sorce_treminal: 'source ~/.zshrc',
                output_file_name: path.join(os.homedir(), 'Downloads', 'out1.json'),
                shell: '/bin/zsh'
            };
        default: // linux
            return {
                activate_command: 'conda activate test-idaes-extension',
                sorce_treminal: 'source ~/.bashrc',
                output_file_name: path.join(os.homedir(), 'out1.json'),
                shell: '/bin/bash'
            };
    }
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
        return { shell, args: ['-Command', command] };
    }
    return { shell, args: ['-c', command] };
}

/**
 * Returns additional spawn options that differ per platform.
 * On Windows we add `windowsHide: true` to prevent a console window from flashing.
 */
export function getSpawnOptions(): cp.SpawnOptions {
    if (isWindows()) {
        return { detached: true, windowsHide: true };
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
 * Returns the cross-platform path to the IDAES SQLite database.
 * Uses `path.join()` instead of template literals to ensure correct separators.
 */
export function getIdaesDbPath(): string {
    return path.join(os.homedir(), '.idaes', 'reportdb.sqlite');
}

/**
 * Returns the stderr-suppress redirect for the current platform.
 * - Unix:    `2>/dev/null`
 * - Windows: `2>NUL`
 */
export function getStderrRedirect(): string {
    return isWindows() ? '2>NUL' : '2>/dev/null';
}

/**
 * Builds a sqlite3 CLI command string with proper quoting per platform.
 * Wraps the db path in quotes to handle paths with spaces (common on Windows).
 */
export function buildSqliteCommand(dbPath: string, query: string, jsonMode: boolean = false): string {
    const jsonFlag = jsonMode ? '-json ' : '';
    return `sqlite3 ${jsonFlag}"${dbPath}" "${query}"`;
}

/**
 * Builds a sqlite3 command with a fallback query for schema compatibility.
 * Uses `||` (works in both bash/zsh and cmd.exe) and platform-appropriate stderr redirect.
 * 
 * This pattern tries `query1` first (modern schema); if it fails, falls back to `query2` (legacy schema).
 */
export function buildSqliteFallbackCommand(dbPath: string, query1: string, query2: string, jsonMode: boolean = false): string {
    const stderrRedirect = getStderrRedirect();
    const cmd1 = buildSqliteCommand(dbPath, query1, jsonMode);
    const cmd2 = buildSqliteCommand(dbPath, query2, jsonMode);
    return `${cmd1} ${stderrRedirect} || ${cmd2}`;
}
