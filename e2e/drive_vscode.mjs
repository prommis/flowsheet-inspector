// E2E harness: drive a real VS Code extension-development-host over CDP and
// verify the IPOPT tab layout (issue #34 regression test).
//
// Flow: launch VS Code with a throwaway profile → connect over CDP → open the
// results panel via the command palette → locate the webview's inner frame
// (webviews are separate CDP targets, NOT frames of the workbench page) →
// inject a real report via postMessage → interact and measure.
//
// See README.md in this folder for prerequisites and hard-won gotchas.
import { chromium } from 'playwright-core';
import { spawn, execSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(E2E_DIR);
const CODE = process.env.VSCODE_BIN
    || '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
const PORT = Number(process.env.CDP_PORT || 9337);
const PROFILE = '/tmp/fi-e2e-profile';

/**
 * Kills any leftover test VS Code instance (identified by the throwaway
 * profile dir) so reruns never collide on the user-data-dir lock or the
 * debug port. Best-effort: ignores "no process matched".
 */
function cleanup() {
    try { execSync(`pkill -f ${PROFILE}`); } catch { /* nothing running */ }
}

/**
 * Fails the test run: prints the reason, kills the spawned VS Code, exits 1.
 * @param {string} msg Reason shown in the test output.
 */
function fail(msg) {
    console.error(`FAIL: ${msg}`);
    cleanup();
    process.exit(1);
}

/**
 * Scans every browser context, page and frame reachable over the CDP
 * connection for a frame containing the given visible text. Webview content
 * lives in its own CDP target, so searching only the workbench page's frame
 * tree will never find it.
 *
 * @param {import('playwright-core').Browser} browser Connected CDP browser.
 * @param {string} text Visible text that identifies the wanted frame.
 * @param {number} attempts Retry count (1s apart) while the UI loads.
 * @returns {Promise<import('playwright-core').Frame | null>} The frame, or null.
 */
async function findFrameByText(browser, text, attempts = 25) {
    for (let i = 0; i < attempts; i++) {
        for (const ctx of browser.contexts()) {
            for (const page of ctx.pages()) {
                for (const frame of page.frames()) {
                    try {
                        if (await frame.locator(`text=${text}`).count() > 0) { return frame; }
                    } catch { /* frame detached mid-scan */ }
                }
            }
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return null;
}

// ── Launch VS Code dev host ─────────────────────────────────────────────────
cleanup();
const report = JSON.parse(readFileSync(join(E2E_DIR, 'sample_report.json'), 'utf-8'));
// Wrap the solver output in a minimal broadcast payload with diagnostics
// forced valid, so the IPOPT tab always renders regardless of whether the
// sampled run itself failed.
const solverOutput = report?.actions?.solver_output ?? { output: null };
const payload = { actions: { solver_output: solverOutput, diagnostics: { valid: true } }, last_run: [] };
if (!solverOutput.output) { fail('sample_report.json has no actions.solver_output — re-export from a solve run'); }

spawn(CODE, [
    `--extensionDevelopmentPath=${REPO}/extension`,
    `--user-data-dir=${PROFILE}`,
    '--disable-workspace-trust',
    `--remote-debugging-port=${PORT}`,
    '--new-window',
    `${REPO}/release.md`, // any file: openWebView only needs an active editor
], { stdio: 'ignore', detached: true }).unref();

// ── Connect over CDP ────────────────────────────────────────────────────────
let browser = null;
for (let i = 0; i < 40 && !browser; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { /* not up yet */ }
}
if (!browser) { fail('could not connect to CDP endpoint'); }
console.log('connected over CDP');

let win = null;
for (let i = 0; i < 30 && !win; i++) {
    win = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('workbench.html')) ?? null;
    if (!win) { await new Promise(r => setTimeout(r, 1000)); }
}
if (!win) { fail('workbench page not found'); }
console.log('workbench:', (await win.title()).slice(0, 70));
await win.waitForTimeout(9000); // let the extension host finish activating

// ── Open the results panel via the command palette ──────────────────────────
// Retried because a brand-new profile's first-run UI (welcome tab, focus
// grabs) can swallow the first palette invocation.
let panel = null;
for (let attempt = 1; attempt <= 3 && !panel; attempt++) {
    await win.keyboard.press('Escape');
    await win.keyboard.press('Meta+Shift+KeyP');
    await win.waitForTimeout(1200);
    await win.keyboard.type('Open Flowsheet Inspector', { delay: 25 });
    await win.waitForTimeout(1200);
    await win.keyboard.press('Enter');
    panel = await findFrameByText(browser, 'FLOWSHEET VARIABLES', 15);
    if (!panel) { console.log(`palette attempt ${attempt} did not open the panel, retrying...`); }
}
if (!panel) { fail('results panel webview frame not found'); }
console.log('panel frame found');

// ── Inject the report exactly as the extension would broadcast it ───────────
await panel.evaluate((d) => window.postMessage({ type: 'flowsheet_runner_result', data: d }, '*'), payload);
await win.waitForTimeout(1500);

// ── Interact + measure (swap this section out for other regression tests) ───
await panel.click('text=IPOPT');
await win.waitForTimeout(1500);
const showBtn = panel.locator('text=Show iterations');
if (await showBtn.count() === 0) {
    fail(`no "Show iterations" button; panel text: ${(await panel.locator('body').innerText()).slice(0, 300)}`);
}
await showBtn.first().click();
await win.waitForTimeout(1500);

const result = await panel.evaluate(() => {
    const pres = [...document.querySelectorAll('pre')];
    const iters = pres[pres.length - 1];
    iters.scrollTop = iters.scrollHeight;
    const atBottom = Math.abs(iters.scrollTop + iters.clientHeight - iters.scrollHeight) < 2;
    const hideBtn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('Hide iterations'));
    const btnRect = hideBtn?.getBoundingClientRect();
    return {
        iterations_box_height: iters.clientHeight,
        iterations_content_height: iters.scrollHeight,
        iterations_scrolls_internally: iters.scrollHeight > iters.clientHeight,
        iterations_reached_bottom: atBottom,
        hide_button_visible: !!btnRect && btnRect.top >= 0 && btnRect.bottom <= window.innerHeight,
        viewport: window.innerHeight,
    };
});
console.log(JSON.stringify(result, null, 2));
await win.screenshot({ path: join(E2E_DIR, 'vsc_ipopt.png') });

// The box must stay within its 60vh cap and the toggle button must remain
// on-screen. Internal scrolling is only required when the sampled run's
// iteration log is actually taller than the cap.
const cap = result.viewport * 0.6 + 2;
const contentFits = result.iterations_content_height <= result.iterations_box_height + 2;
const pass = result.iterations_reached_bottom
    && result.hide_button_visible
    && result.iterations_box_height <= cap
    && (contentFits || result.iterations_scrolls_internally);
cleanup();
if (!pass) {
    console.error('FAIL: layout assertions not met');
    process.exit(1);
}
console.log('PASS');
process.exit(0);
