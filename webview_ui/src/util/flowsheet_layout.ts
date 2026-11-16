import ELK, { type ElkNode, type ElkPoint } from 'elkjs/lib/elk.bundled.js';
import mermaid from 'mermaid';
import type { FlowDB } from 'mermaid/dist/diagrams/flowchart/flowDb.js';

const elk = new ELK();
const ICON_HEIGHT = 64;
let pendingRender: Promise<void> = Promise.resolve();

/** Mermaid's parser owns shared state. Serialize parsing, rendering and layout
 * together, including requests from rapid direction changes or tab remounts. */
export function renderFlowsheet(definition: string, diagramClass: string) {
    const result = pendingRender.then(async () => {
        const { svg } = await mermaid.render(`mermaid-diagram-${crypto.randomUUID()}`, definition);
        const staging = document.createElement('div');
        staging.className = diagramClass;
        staging.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden';
        staging.innerHTML = svg;
        document.body.append(staging);
        try {
            const element = staging.querySelector('svg')!;
            await layoutFlowsheet(element, definition);
            return element;
        } finally {
            staging.remove();
        }
    });
    pendingRender = result.then(() => {}, () => {});
    return result;
}

/** Reuse Mermaid's SVG symbols and labels, but route image diagrams against
 * fixed ports on the symbols. Labels are external layout obstacles, never ports. */
async function layoutFlowsheet(svg: SVGSVGElement, definition: string) {
    if (!svg.querySelector('.image-shape')) return;
    const parsed = await mermaid.mermaidAPI.getDiagramFromText(definition);
    const db = parsed.db as FlowDB;
    // Connectivity emits flat graphs. Leave manually authored groups to Mermaid.
    if (db.getSubGraphs().length) return;
    const { nodes, edges } = db.getData();
    const direction = db.getDirection();
    const horizontal = direction === 'LR' || direction === 'RL';
    const reversed = direction === 'RL' || direction === 'BT';
    const elements = new Map<string, {
        element: SVGGElement;
        image: SVGImageElement | null;
        bounds: DOMRect;
        label: SVGGElement | null;
        labelBounds?: DOMRect;
    }>();

    const children: ElkNode[] = nodes.map(node => {
        const element = svg.querySelector<SVGGElement>(`[id="${CSS.escape(`${svg.id}-${node.domId}`)}"]`);
        if (!element) throw new Error(`Missing rendered unit: ${node.id}`);
        const image = element.querySelector<SVGImageElement>('image');
        const bounds = (image ?? element).getBBox();
        const label = image ? element.querySelector<SVGGElement>('.label') : null;
        const labelBounds = label?.getBBox();
        elements.set(node.id, { element, image, bounds, label, labelBounds });
        const iconWidth = ICON_HEIGHT * bounds.width / bounds.height;
        const width = image ? (horizontal ? iconWidth : ICON_HEIGHT) : bounds.width;
        const height = image ? (horizontal ? ICON_HEIGHT : iconWidth) : bounds.height;
        const input = horizontal ? { x: 0, y: height / 2 } : { x: width / 2, y: 0 };
        const output = horizontal ? { x: width, y: height / 2 } : { x: width / 2, y: height };
        const inSide = horizontal ? 'WEST' : 'NORTH';
        const outSide = horizontal ? 'EAST' : 'SOUTH';
        return {
            id: node.id, width, height,
            layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
            ports: [
                { id: `${node.id}:in`, ...(reversed ? output : input), width: 0, height: 0,
                    layoutOptions: { 'elk.port.side': reversed ? outSide : inSide } },
                { id: `${node.id}:out`, ...(reversed ? input : output), width: 0, height: 0,
                    layoutOptions: { 'elk.port.side': reversed ? inSide : outSide } },
            ],
            labels: labelBounds ? [{
                id: `${node.id}:label`, text: node.label ?? node.id,
                width: labelBounds.width, height: labelBounds.height,
                layoutOptions: { 'elk.nodeLabels.placement': horizontal
                    ? 'OUTSIDE V_BOTTOM H_CENTER' : 'OUTSIDE V_CENTER H_RIGHT' },
            }] : [],
        };
    });
    const renderedEdges = edges.map(edge => {
        let path = svg.querySelector<SVGPathElement>(`.edgePaths path[data-id="${CSS.escape(edge.id)}"]`);
        // Mermaid splits self-loops into three temporary edges. ELK routes the
        // original loop as one edge; retain its styling and arrowhead.
        if (!path && edge.start === edge.end) {
            const last = svg.querySelector<SVGPathElement>(`.edgePaths path[data-id="${CSS.escape(`${edge.start}-cyclic-special-2`)}"]`);
            const first = svg.querySelector<SVGPathElement>(`.edgePaths path[data-id="${CSS.escape(`${edge.start}-cyclic-special-1`)}"]`);
            if (last) {
                path = last.cloneNode(true) as SVGPathElement;
                path.id = `${svg.id}-${edge.id}`;
                path.dataset.id = edge.id;
                const startMarker = first?.getAttribute('marker-start');
                if (startMarker) path.setAttribute('marker-start', startMarker);
            }
        }
        if (!path || !edge.start || !edge.end) throw new Error(`Missing rendered stream: ${edge.id}`);
        const labelId = edge.start === edge.end ? `${edge.start}-cyclic-special-mid` : edge.id;
        const label = svg.querySelector<SVGGElement>(`.edgeLabels .label[data-id="${CSS.escape(labelId)}"]`)
            ?.parentElement as SVGGElement | null;
        const bounds = label?.getBBox();
        return { edge, path, label, bounds };
    });
    const layout = await elk.layout<ElkNode>({
        id: 'flowsheet', children,
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': horizontal ? (reversed ? 'LEFT' : 'RIGHT') : (reversed ? 'UP' : 'DOWN'),
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.padding': '[top=32,left=32,bottom=32,right=32]',
            'elk.spacing.nodeNode': '60',
            'elk.spacing.edgeNode': '28',
            'elk.spacing.edgeEdge': '22',
            'elk.layered.spacing.nodeNodeBetweenLayers': '100',
            'elk.layered.spacing.edgeNodeBetweenLayers': '28',
            'elk.layered.spacing.edgeEdgeBetweenLayers': '22',
            // Preserve the model's unit order when choosing feedback edges.
            'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
            'elk.layered.nodePlacement.favorStraightEdges': 'true',
            'elk.layered.mergeEdges': 'false',
        },
        edges: renderedEdges.map(({ edge, bounds }) => ({
            id: edge.id, sources: [`${edge.start}:out`], targets: [`${edge.end}:in`],
            labels: bounds?.width ? [{ id: `${edge.id}:label`, text: edge.label ?? '', width: bounds.width, height: bounds.height }] : [],
        })),
    });

    const original = svg.querySelector(':scope > g');
    const group = svgElement('g', { class: 'flowsheet-layout' });
    const edgeLayer = svgElement('g', { class: 'edgePaths' });
    const labelLayer = svgElement('g', { class: 'edgeLabels' });
    const nodeLayer = svgElement('g', { class: 'nodes' });
    group.append(edgeLayer, labelLayer, nodeLayer);
    // Preserve arrowhead definitions that Mermaid may place inside its root.
    svg.querySelectorAll('defs').forEach(defs => svg.append(defs));
    const markerId = `${svg.id}-port-arrow`;
    const marker = svgElement('marker', { id: markerId, viewBox: '0 0 10 10', refX: '10', refY: '5',
        markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
    marker.append(svgElement('path', { d: 'M0 0L10 5L0 10Z', fill: '#ccc', stroke: 'none' }));
    const defs = svgElement('defs', {});
    defs.append(marker);
    svg.append(defs);

    for (const node of layout.children ?? []) {
        const { element, image, bounds, label, labelBounds } = elements.get(node.id)!;
        element.dataset.nodeId = node.id;
        if (image) {
            element.setAttribute('transform', `translate(${node.x},${node.y})`);
            element.querySelectorAll(':scope > g:not(.label)').forEach(frame => frame.remove());
            image.setAttribute('x', '0');
            image.setAttribute('y', '0');
            image.setAttribute('width', `${ICON_HEIGHT * bounds.width / bounds.height}`);
            image.setAttribute('height', `${ICON_HEIGHT}`);
            // The supplied symbols face right; rotate their inlet/outlet axis
            // with the flow so vertical ports touch the actual symbol too.
            image.setAttribute('transform', horizontal
                ? (reversed ? `translate(${node.width},${node.height}) rotate(180)` : '')
                : (reversed ? `translate(0,${node.height}) rotate(-90)` : `translate(${node.width},0) rotate(90)`));
            const position = node.labels?.[0];
            if (label && labelBounds && position) {
                label.setAttribute('transform', `translate(${position.x! - labelBounds.x},${position.y! - labelBounds.y})`);
            }
        } else {
            element.setAttribute('transform', `translate(${node.x! - bounds.x},${node.y! - bounds.y})`);
        }
        nodeLayer.append(element);
    }
    for (const routed of layout.edges ?? []) {
        const { edge, path, label } = renderedEdges.find(item => item.edge.id === routed.id)!;
        path.setAttribute('d', (routed.sections ?? []).map(section =>
            pathFromPoints([section.startPoint, ...section.bendPoints ?? [], section.endPoint])).join(' '));
        path.dataset.source = edge.start;
        path.dataset.target = edge.end;
        path.removeAttribute('data-points');
        for (const attr of ['marker-start', 'marker-end']) {
            if (path.getAttribute(attr)?.includes('point')) path.setAttribute(attr, `url(#${markerId})`);
        }
        edgeLayer.append(path);
        const position = routed.labels?.[0];
        if (label && position) {
            label.setAttribute('transform', `translate(${position.x! + position.width! / 2},${position.y! + position.height! / 2})`);
            labelLayer.append(label);
        }
    }
    original?.remove();
    svg.append(group);
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.style.maxWidth = `${layout.width}px`;
    svg.style.height = 'auto';
    svg.dataset.layout = 'flowsheet';
    svg.dataset.direction = direction;
}

function pathFromPoints(points: ElkPoint[]) {
    return points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
}
