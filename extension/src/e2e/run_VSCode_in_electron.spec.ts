import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const extensionPath = path.resolve(__dirname, '../../');
const userDataDir = path.join(os.tmpdir(), `vscode-e2e-test-${Date.now()}`);
// empty, isolated extensions dir so ONLY our --extensionDevelopmentPath extension
// loads (no user/machine extensions). Keeps local runs identical to clean CI.
const extensionsDir = path.join(userDataDir, 'extensions');

function setupUserDataDir(dir: string) {
    const userSettingsDir = path.join(dir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });
    fs.writeFileSync(path.join(userSettingsDir, 'settings.json'), JSON.stringify({
        'workbench.startupEditor': 'none',
        'telemetry.telemetryLevel': 'off',
        'extensions.ignoreRecommendations': true,
        'github.copilot.editor.enableAutoCompletions': false,
        'security.workspace.trust.enabled': false,
    }));
}

test('extension loads in VS Code', async () => {
    setupUserDataDir(userDataDir);
    const executablePath = await downloadAndUnzipVSCode('stable');

    // strip ELECTRON_RUN_AS_NODE (set when this test is run from inside an
    // Electron/VS Code terminal) — it makes the launched VS Code run as plain
    // Node and reject all flags. Harmless on CI where it isn't set.
    const launchEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') {
            launchEnv[k] = v;
        }
    }

    const app = await electron.launch({
        executablePath,
        env: launchEnv,
        args: [
            `--extensionDevelopmentPath=${extensionPath}`,
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            // disable the built-in Copilot so its delayed sign-in modal
            // doesn't cover the sidebar on CI. Targeted ids — does NOT
            // affect the extension under test.
            '--disable-extension=GitHub.copilot',
            '--disable-extension=GitHub.copilot-chat',
            '--no-sandbox',
            '--disable-gpu',
        ],
    });

    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.monaco-workbench', { timeout: 30000 });
    await page.screenshot({ path: 'test-results/workbench-loaded.png' });

    // dismiss the Copilot onboarding modal if it still slips through
    const closeBtn = page.locator('button.onboarding-a-close-btn');
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await closeBtn.click();
    }
    await page.screenshot({ path: 'test-results/vscodeStart.png' });

    // click the IDAES Control icon in the activity bar (always directly visible
    // because --extensions-dir isolates us from other extensions)
    await page.locator('[aria-label="IDAES Control"]').first().click({ timeout: 10000 });

    // verify the IDAES view container opened: its sidebar title shows the
    // contributed view name "Run Control".
    await expect(page.locator('.part.sidebar .composite.title'))
        .toContainText('Run Control', { timeout: 15000 });
    await page.screenshot({ path: 'test-results/extensionLoaded.png' });

    await app.close();
});
