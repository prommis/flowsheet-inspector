/** Runs inside the webview. Measure actual rendered endpoints, not layout metadata. */
export function inspectDiagramGeometry() {
    const svg = document.querySelector('svg[data-layout="flowsheet"]');
    if (!svg) throw new Error('flowsheet layout is not ready');
    const horizontal = ['LR', 'RL'].includes(svg.dataset.direction);
    const reversed = ['RL', 'BT'].includes(svg.dataset.direction);
    const shapes = new Map([...svg.querySelectorAll('[data-node-id]')].map(node =>
        [node.dataset.nodeId, (node.querySelector('image') || node).getBoundingClientRect()]));
    const labels = [...svg.querySelectorAll('.nodes .label foreignObject')].map(label => label.getBoundingClientRect());
    const errors = [];
    let checkedEdges = 0;
    for (const path of svg.querySelectorAll('.edgePaths path[data-source]')) {
        const start = path.getPointAtLength(0).matrixTransform(path.getScreenCTM());
        const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM());
        for (const [point, id, output] of [[start, path.dataset.source, true], [end, path.dataset.target, false]]) {
            const box = shapes.get(id);
            const farSide = output !== reversed;
            const expected = horizontal
                ? { x: farSide ? box.right : box.left, y: box.top + box.height / 2 }
                : { x: box.left + box.width / 2, y: farSide ? box.bottom : box.top };
            if (Math.hypot(point.x - expected.x, point.y - expected.y) > 0.75) {
                errors.push(`${id}: endpoint misses the symbol's side midpoint`);
            }
        }
        const points = [...path.getAttribute('d').matchAll(/[ML]\s*([-\d.e+]+)[,\s]+([-\d.e+]+)/gi)]
            .map(match => new DOMPoint(Number(match[1]), Number(match[2])).matrixTransform(path.getScreenCTM()));
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            if (Math.abs(a.x - b.x) > 0.1 && Math.abs(a.y - b.y) > 0.1) errors.push('diagonal stream segment');
            for (const box of labels) {
                const crosses = Math.abs(a.y - b.y) < 0.1
                    ? a.y > box.top + 1 && a.y < box.bottom - 1
                        && Math.max(a.x, b.x) > box.left + 1 && Math.min(a.x, b.x) < box.right - 1
                    : a.x > box.left + 1 && a.x < box.right - 1
                        && Math.max(a.y, b.y) > box.top + 1 && Math.min(a.y, b.y) < box.bottom - 1;
                if (crosses) errors.push('stream crosses a unit name');
            }
        }
        checkedEdges++;
    }
    return { direction: svg.dataset.direction, checkedEdges, errors };
}
