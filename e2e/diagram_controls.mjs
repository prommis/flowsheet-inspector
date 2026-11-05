// Exercise production diagram controls in headless Chrome with synthetic run results.
// Run the webview build first. CHROME_BIN can override the macOS Chrome path.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { chromium } from 'playwright-core';

const dist = new URL('../webview_ui/dist/', import.meta.url);
await readFile(new URL('index.html', dist));
const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const file = new URL(pathname.slice(1) || 'index.html', dist);
        const body = await readFile(file);
        response.setHeader('Content-Type', contentTypes[extname(file.pathname)] || 'application/octet-stream');
        response.end(body);
    } catch {
        response.writeHead(404).end();
    }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({
        executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        window.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} });
    });
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0);
    await page.evaluate(() => window.postMessage({ type: 'init', loadApp: 'webView' }, '*'));
    await page.getByRole('button', { name: 'Fit', exact: true }).waitFor();

    const problems = [];
    const check = (condition, problem) => {
        if (!condition) problems.push(problem);
    };
    const viewport = page.getByLabel('Flowsheet diagram');
    const click = name => page.getByRole('button', { name, exact: true }).click();
    const state = () => viewport.evaluate(element => {
        const matrix = new DOMMatrix(getComputedStyle(element.firstElementChild).transform);
        return { scale: matrix.a, x: matrix.e, y: matrix.f, id: element.querySelector('svg')?.id };
    });
    const sameView = (left, right) => left.scale === right.scale && left.x === right.x && left.y === right.y;
    const waitForDiagram = previousId => page.waitForFunction(id => {
        const svg = document.querySelector('[data-ready] svg');
        return svg && svg.id !== id;
    }, previousId);
    const show = async diagram => {
        const previous = (await state()).id;
        await page.evaluate(text => window.postMessage({
            type: 'flowsheet_runner_result',
            data: { actions: { mermaid_diagram: { diagram: text }, diagnostics: { valid: true } } },
        }, '*'), diagram);
        await waitForDiagram(previous);
    };

    // Fit must be allowed below the normal zoom minimum without reversing Zoom Out.
    const small = 'graph LR\nFeed --> Heater --> Reactor --> Product';
    const ids = Array.from({ length: 180 }, (_, index) => `n${index}`);
    const large = [
        'graph LR',
        ...ids.map(id => `${id}["Equipment with a long label number ${id}"]`),
        ids.join(' --> '),
    ].join('\n');
    await show(large);
    const fitted = await state();
    assert.ok(fitted.scale < 0.05, 'Large fixture must fit below 5%');
    await click('Zoom Out');
    check((await state()).scale <= fitted.scale, 'Zoom Out enlarges a diagram fitted below 5%');
    await click('Fit');
    await click('Zoom In');
    check(Math.abs((await state()).scale / fitted.scale - 1.25) < 0.001,
        'Zoom In jumps to 5% instead of increasing gradually from Fit');

    // A zoom action updates the current SVG rather than replacing it.
    await show(small);
    const beforeZoom = await state();
    await page.evaluate(() => {
        const canvas = document.querySelector('[aria-label="Flowsheet diagram"]').firstElementChild;
        window.styleWrites = 0;
        window.observer = new MutationObserver(records => window.styleWrites += records.length);
        window.observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    });
    await click('Zoom In');
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const writes = await page.evaluate(() => {
        window.observer.disconnect();
        return window.styleWrites;
    });
    check(writes === 1, `Zoom writes the canvas style ${writes} times instead of once`);
    check((await state()).id === beforeZoom.id, 'Zoom regenerates the SVG');

    const saved = await state();
    await page.locator('li').filter({ hasText: /^FLOWSHEET VARIABLES/ }).click();
    await page.locator('li').filter({ hasText: /^DIAGRAM$/ }).click();
    await viewport.locator('svg').waitFor();
    check(sameView(await state(), saved), 'Tab switch loses zoom or pan');

    const beforeWheel = await state();
    await viewport.evaluate(element => element.dispatchEvent(new WheelEvent('wheel', {
        ctrlKey: true, deltaY: 0, bubbles: true, cancelable: true,
    })));
    check(sameView(await state(), beforeWheel), 'Zero vertical wheel movement changes zoom');

    // Replacing the SVG mid-drag must release capture but retain the chosen view.
    await viewport.evaluate(element => element.addEventListener('pointerdown', event => {
        element.dataset.pointerId = String(event.pointerId);
    }, { once: true }));
    const box = await viewport.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 115, box.y + 110);
    const beforeDirection = await state();
    await page.getByRole('combobox').selectOption('TB');
    await waitForDiagram(beforeDirection.id);
    check(sameView(await state(), beforeDirection), 'Direction change loses zoom or pan');
    const captured = await viewport.evaluate(element => element.hasPointerCapture(Number(element.dataset.pointerId)));
    check(!captured, 'Direction change leaves the old drag pointer captured');
    await page.mouse.up();

    // Rendering at zero size must defer the first Fit until the panel is visible.
    await viewport.evaluate(element => element.parentElement.style.display = 'none');
    await show(small);
    await viewport.evaluate(element => element.parentElement.style.display = '');
    try {
        await page.waitForFunction(() => {
            const viewport = document.querySelector('[aria-label="Flowsheet diagram"]');
            const svg = viewport.querySelector('svg').getBoundingClientRect();
            const box = viewport.getBoundingClientRect();
            const centerX = box.x + viewport.clientLeft + viewport.clientWidth / 2;
            const centerY = box.y + viewport.clientTop + viewport.clientHeight / 2;
            return Math.abs(svg.x + svg.width / 2 - centerX) < 1
                && Math.abs(svg.y + svg.height / 2 - centerY) < 1;
        }, null, { timeout: 1500 });
    } catch {
        problems.push('Diagram rendered in a hidden viewport does not Fit when shown');
    }
    const beforeResize = await state();
    await page.setViewportSize({ width: 800, height: 650 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    check(sameView(await state(), beforeResize), 'Resize overwrites a saved view');

    check(errors.length === 0, `Browser errors: ${errors.join(', ')}`);
    assert.deepEqual(problems, []);
    console.log('PASS diagram zoom limits, tab and direction persistence, wheel handling, drag cleanup, deferred Fit and resize behavior.');
} finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
