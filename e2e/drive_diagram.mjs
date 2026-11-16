// Verify SVG unit images and fallbacks in a real VS Code webview.
// Export a report with image nodes first; REPORT_PATH overrides sample_report.json.
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
import { inspectDiagramGeometry } from './diagram_geometry.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(E2E_DIR);
const CODE = process.env.VSCODE_BIN
    || '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
const PORT = Number(process.env.CDP_PORT || 9338);
const PROFILE = '/tmp/fi-svg-e2e-profile';

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
const report = JSON.parse(readFileSync(process.env.REPORT_PATH || join(E2E_DIR, 'sample_report.json'), 'utf-8'));
const diagram = report?.actions?.mermaid_diagram?.diagram;
const lines = typeof diagram === 'string' ? diagram.split('\n') : diagram;
const expectedImages = lines?.filter(line => line.includes('img:')).length ?? 0;
if (!expectedImages) fail('report has no image nodes; rerun a flowsheet with unit images enabled');
const payload = { ...report, actions: { ...report.actions, mermaid_diagram: { diagram: lines },
    diagnostics: { ...report.actions?.diagnostics, valid: true } } };

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

// Inject the Python report after its generating process has already exited.
try {
    await panel.evaluate(d => window.postMessage({ type: 'flowsheet_runner_result', data: d }, '*'), payload);
    const waitForImages = () => panel.waitForFunction(count =>
        document.querySelectorAll('.image-shape image').length === count,
        expectedImages, { timeout: 15000 });
    await waitForImages();
    const geometry = [];
    const checkGeometry = async () => {
        await panel.waitForSelector('svg[data-layout="flowsheet"]');
        const result = await panel.evaluate(inspectDiagramGeometry);
        if (!result.checkedEdges || result.errors.length) throw new Error(JSON.stringify(result));
        geometry.push(result);
    };
    await checkGeometry();
    const images = await panel.evaluate(async () => Promise.all(
        [...document.querySelectorAll('.image-shape image')].map(async node => {
            const image = new Image();
            image.src = node.getAttribute('href');
            await image.decode();
            return { url: image.src, width: image.naturalWidth, height: image.naturalHeight,
                filter: getComputedStyle(node).filter };
        })
    ));
    if (images.some(image => !image.width || !image.height)) throw new Error('empty SVG image');
    const decoration = await panel.evaluate(() => {
        const nodes = [...document.querySelectorAll('.image-shape')];
        return {
            framesHidden: nodes.every(node => [...node.querySelectorAll(':scope > g:not(.label)')]
                .every(frame => getComputedStyle(frame).visibility === 'hidden')),
            labelBackdropsHidden: nodes.every(node => [...node.querySelectorAll('.label div, .label span, .label p')]
                .every(label => getComputedStyle(label).backgroundColor === 'rgba(0, 0, 0, 0)')),
            labelsVisible: nodes.every(node => getComputedStyle(node.querySelector('.label')).visibility === 'visible'),
            edgesVisible: [...document.querySelectorAll('.edgePath, .flowchart-link')]
                .some(edge => getComputedStyle(edge).visibility === 'visible'),
        };
    });
    if (Object.values(decoration).some(value => !value)) {
        throw new Error(`image decorations or edges are incorrect: ${JSON.stringify(decoration)}`);
    }

    // Both directions must render, and the selection must survive tab switches.
    const direction = panel.getByRole('combobox');
    await direction.selectOption('TB');
    await panel.waitForSelector('svg[data-layout="flowsheet"][data-direction="TB"]');
    await checkGeometry();
    await panel.waitForFunction(() => {
        const nodes = [...document.querySelectorAll('.image-shape')];
        return nodes.length > 1 && Math.abs(nodes[0].getBoundingClientRect().y - nodes[1].getBoundingClientRect().y) > 20;
    });
    await panel.getByText('LOGS', { exact: true }).click();
    await panel.getByText('DIAGRAM', { exact: true }).click();
    await waitForImages();
    if (await panel.getByRole('combobox').inputValue() !== 'TB') throw new Error('direction was not preserved');
    await panel.getByRole('combobox').selectOption('LR');
    await panel.waitForSelector('svg[data-layout="flowsheet"][data-direction="LR"]');
    await checkGeometry();
    await panel.waitForFunction(() => {
        const nodes = [...document.querySelectorAll('.image-shape')];
        return nodes.length > 1 && Math.abs(nodes[0].getBoundingClientRect().x - nodes[1].getBoundingClientRect().x) > 20;
    });
    await win.screenshot({ path: '/tmp/fi-svg-diagram.png' });
    await panel.locator('svg').screenshot({ path: '/tmp/fi-svg-symbols.png' });

    // Branches, mixed icon/ordinary nodes, stream labels and a self-loop must
    // retain their topology and avoid unit names in both layout directions.
    const imageUrl = images[0].url;
    const fixture = `flowchart LR
        A@{ img: "${imageUrl}", label: "Feed unit", h: 50, constraint: "on" }
        B["Custom unit"]
        C@{ img: "${imageUrl}", label: "Product unit", h: 50, constraint: "on" }
        A -- "feed stream" --> B
        A --> C
        B --> C
        C --> A
        C --> C`;
    const previousSvg = await panel.locator('svg').getAttribute('id');
    await panel.evaluate(d => window.postMessage({ type: 'flowsheet_runner_result', data: d }, '*'),
        { ...payload, actions: { ...payload.actions, mermaid_diagram: { diagram: fixture } } });
    await panel.waitForFunction(id => {
        const svg = document.querySelector('svg[data-layout="flowsheet"]');
        return svg && svg.id !== id;
    }, previousSvg);
    await checkGeometry();
    await panel.getByText('feed stream', { exact: true }).waitFor();
    await panel.getByRole('combobox').selectOption('TB');
    await panel.waitForSelector('svg[data-layout="flowsheet"][data-direction="TB"]');
    await checkGeometry();
    for (const dir of ['LR', 'TB', 'LR']) await panel.getByRole('combobox').selectOption(dir);
    await panel.waitForSelector('svg[data-layout="flowsheet"][data-direction="LR"]');
    await checkGeometry();

    // Simulate an old historical report whose local image server has stopped.
    const unavailable = lines.map(line => line.replace(/http:\/\/localhost:\d+/g, 'http://127.0.0.1:1'));
    await panel.evaluate(d => window.postMessage({ type: 'flowsheet_runner_result', data: d }, '*'),
        { ...payload, actions: { ...payload.actions, mermaid_diagram: { diagram: unavailable } } });
    await panel.getByText('Some unit images are unavailable.', { exact: false }).waitFor();
    if (await panel.locator('svg').count() !== 1 || await panel.locator('.image-shape image').count()) {
        throw new Error('unavailable images did not fall back to a complete diagram');
    }

    // Existing reports with ordinary nodes must continue to render.
    await panel.evaluate(() => window.postMessage({ type: 'flowsheet_runner_result', data: {
        actions: { mermaid_diagram: { diagram: 'flowchart LR\nA["Old unit"] --> B["Custom unit"]' }, diagnostics: { valid: true } }, last_run: [],
    } }, '*'));
    await panel.getByText('Old unit', { exact: true }).waitFor();
    if (await panel.getByText('Mermaid render error:', { exact: false }).count()) throw new Error('plain diagram failed');
    console.log(JSON.stringify({ images, decoration, geometry, directions: ['TB', 'LR'], tabPersistence: true, unavailableFallback: true, plainDiagram: true }, null, 2));
    console.log('PASS');
} catch (error) {
    fail(error.stack || String(error));
} finally {
    await browser.close();
    cleanup();
}
process.exit(0);
