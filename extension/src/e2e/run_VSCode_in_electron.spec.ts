import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const extensionPath = path.resolve(__dirname, '../../');
const userDataDir = path.join(os.tmpdir(), `vscode-e2e-test-${Date.now()}`);

function setupUserDataDir(dir: string) {
    const userSettingsDir = path.join(dir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });
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

    const app = await electron.launch({
        executablePath,
        args: [
            `--extensionDevelopmentPath=${extensionPath}`,
            `--user-data-dir=${userDataDir}`,
            '--no-sandbox',
            '--disable-gpu',
        ],
    });

    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.monaco-workbench', { timeout: 30000 });
    await page.screenshot({ path: 'test-results/workbench-loaded.png' });

    // dismiss Copilot onboarding dialog if it appears
    const closeBtn = page.locator('button.onboarding-a-close-btn');
    if (await closeBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await closeBtn.click();
    }

    await page.screenshot({ path: 'test-results/vscodeStart.png' });

    // debug: print all aria-labels in the activity bar
    const activityBarLabels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.activitybar [aria-label]'))
            .map(el => el.getAttribute('aria-label'))
            .filter(Boolean)
    );
    console.log('activity bar aria-labels:', activityBarLabels);

    // click the IDAES Control icon in the activity bar
    await page.locator('[aria-label="IDAES Control"]').first().click({ timeout: 10000 });

    // the IDAES view is a webview, rendered inside an iframe in the sidebar.
    // wait for it to instantiate, then capture the state unconditionally.
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/extensionLoaded.png' });

    // verify the webview iframe was created (proves the view container loaded)
    await expect(page.locator('.part.sidebar iframe').first()).toBeVisible({ timeout: 15000 });

    await app.close();
});
