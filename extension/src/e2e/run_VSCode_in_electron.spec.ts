import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

const vsixPath = path.resolve(__dirname, '../../../flowsheet-inspector-0.0.5.vsix');
const userDataDir = path.join(os.tmpdir(), `vscode-e2e-test-${Date.now()}`);

function setupUserDataDir(dir: string) {
    const userSettingsDir = path.join(dir, 'User');
    fs.mkdirSync(userSettingsDir, { recursive: true });
    fs.writeFileSync(path.join(userSettingsDir, 'settings.json'), JSON.stringify({
        'workbench.startupEditor': 'none',
        'telemetry.telemetryLevel': 'off',
        'extensions.ignoreRecommendations': true,
        'github.copilot.editor.enableAutoCompletions': false,
    }));
}

test('install extension from VSIX and verify it loads', async () => {
    setupUserDataDir(userDataDir);
    const executablePath = await downloadAndUnzipVSCode('stable');

    // install VSIX first as a separate CLI step, then launch normally
    execFileSync(executablePath, [
        `--install-extension=${vsixPath}`,
        `--user-data-dir=${userDataDir}`,
        '--no-sandbox',
    ]);

    const app = await electron.launch({
        executablePath,
        args: [
            `--user-data-dir=${userDataDir}`,
            '--no-sandbox',
            '--disable-gpu',
        ],
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.monaco-workbench', { timeout: 30000 });

    // dismiss Copilot onboarding dialog if it appears
    const closeBtn = page.locator('button.onboarding-a-close-btn');
    if (await closeBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await closeBtn.click();
    }

    await page.screenshot({ path: 'test-results/vscodeStart.png' });

    // open IDAES Control panel — it may be directly in the activity bar (CI)
    // or hidden inside "Additional Views" (local with many extensions)
    const idaesDirectIcon = page.locator('[aria-label="IDAES Control"]');
    const additionalViews = page.locator('[aria-label="Additional Views..."]');

    if (await idaesDirectIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
        await idaesDirectIcon.click();
    } else {
        await additionalViews.click({ timeout: 10000 });
        await page.getByText('IDAES Control').click({ timeout: 5000 });
    }

    await expect(page.locator('#idaes\\.treeView')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/extensionLoaded.png' });

    await app.close();
});
