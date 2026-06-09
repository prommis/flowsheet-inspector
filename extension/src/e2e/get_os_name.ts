import os from 'os';

export function getVSCodeExecutablePath(): string {
    // Allow CI or local env to override via VSCODE_EXECUTABLE_PATH
    if (process.env.VSCODE_EXECUTABLE_PATH) {
        return process.env.VSCODE_EXECUTABLE_PATH;
    }
    const platform = os.platform();
    switch (platform) {
        case 'win32':
            return 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
        case 'darwin':
            return '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
        case 'linux':
            return '/usr/bin/code';
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}