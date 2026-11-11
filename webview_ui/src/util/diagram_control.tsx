import { useCallback, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import { AppContext } from '../context';
import type { DiagramViewState, FlowsheetRunnerResult } from '../interface/interface';

type ViewTransform = NonNullable<DiagramViewState['transform']>;

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const FIT_MARGIN = 16;
const ZOOM_FACTOR = 1.25;

// Weak keys identify result objects without keeping old run data alive.
const resultVersions = new WeakMap<FlowsheetRunnerResult, number>();
let nextResultVersion = 0;

/**
 * Reset the saved transform before a new run result is rendered, keeping direction.
 * Call from Mermaid. A numeric version in the saved view distinguishes a new result
 * from remounting the same result after a tab switch. Result objects are weak keys
 * in a lookup table, so this hook does not retain old run data in Context or the table.
 * Takes no arguments. Context supplies the result and the view state setter.
 * @returns No value. Clear the transform only if its result version has changed.
 */
export function useResetDiagramViewOnResult() {
    const { flowsheetRunnerResult, setDiagramViewState } = useContext(AppContext);

    useLayoutEffect(() => {
        let resultVersion = 0;
        if (flowsheetRunnerResult) {
            const existingVersion = resultVersions.get(flowsheetRunnerResult);
            resultVersion = existingVersion ?? ++nextResultVersion;
            resultVersions.set(flowsheetRunnerResult, resultVersion);
        }
        setDiagramViewState(previous => previous.resultVersion === resultVersion
            ? previous
            : { ...previous, resultVersion, transform: null });
    }, [flowsheetRunnerResult, setDiagramViewState]);
}

/**
 * Manage one diagram's direction, zoom and pan under AppProvider. Takes no arguments.
 * Context owns the saved view. Refs hold DOM elements and the current interaction.
 * A null transform requests Fit once the SVG and viewport have measurable sizes.
 *
 * Translations and pointer coordinates use CSS pixels from the viewport's upper
 * left corner. Positive x moves right, positive y moves down, and scale 1 uses the
 * SVG's natural size. Direction changes and tab switches preserve the saved view.
 *
 * @returns Controls for the caller that owns Mermaid rendering:
 * - viewportRef: attach to the outer clipping area and pointer event target.
 * - mermaidRef: attach to the inner container where the caller inserts the SVG.
 * - prepareDiagram: clear the old SVG and end interactions before replacement.
 * - restoreDiagram: size an inserted SVG and restore its view, or initialize Fit.
 * - fitDiagram: fit and center the complete SVG, then save its transform.
 * - zoomIn / zoomOut: zoom around the viewport center and save the transform.
 * - applyDirection: apply the current direction to Mermaid source text.
 * - directionSelectProps: spread onto the direction select.
 * - pointerHandlers: spread onto the viewport.
 *
 * Only a direction change changes applyDirection's reference. Using it in the
 * rendering effect dependencies does not regenerate the SVG during zoom or pan.
 */
export function useDiagramControl() {
    const { diagramViewState: { direction, transform }, setDiagramViewState } = useContext(AppContext);
    const viewportRef = useRef<HTMLDivElement>(null);
    const mermaidRef = useRef<HTMLDivElement>(null);
    /** Latest transform for successive events before Context finishes rendering. */
    const view = useRef(transform);
    /** Natural SVG size. Null also disables controls while the SVG is unavailable. */
    const diagramSize = useRef<{ width: number; height: number } | null>(null);
    const drag = useRef<{
        pointerId: number;
        x: number;
        y: number;
        target: HTMLDivElement;
    } | null>(null);

    /**
     * Paint a transform without updating Context. Requires transform-origin: 0 0.
     * @param next - Scale multiplier and x/y translations in CSS pixels.
     * @returns No value. Does nothing if the SVG container is not mounted.
     */
    const applyTransform = useCallback(({ scale, x, y }: ViewTransform) => {
        if (mermaidRef.current) {
            mermaidRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        }
    }, []);

    // Sync external Context changes before paint. Locally saved views are already
    // applied, so the same object must not cause a second DOM write.
    useLayoutEffect(() => {
        if (view.current === transform) return;
        view.current = transform;
        if (transform && diagramSize.current) applyTransform(transform);
    }, [transform, applyTransform]);

    /**
     * Paint and persist a changed transform while keeping the selected direction.
     * @param next - Complete transform with scale and x/y translations in CSS pixels.
     * @returns No value. Equal values skip both the DOM write and Context update.
     */
    const saveTransform = useCallback((next: ViewTransform) => {
        const previous = view.current;
        if (previous?.scale === next.scale && previous.x === next.x && previous.y === next.y) return;
        view.current = next;
        applyTransform(next);
        setDiagramViewState(previousState => ({ ...previousState, transform: next }));
    }, [applyTransform, setDiagramViewState]);

    /**
     * Fit the complete SVG with a target margin of 16 CSS pixels on each side.
     * Takes no arguments. Use its natural dimensions and cap scale at 1.
     * @returns No value. Save the centered view, or wait if either size is unavailable.
     */
    const fitDiagram = useCallback(() => {
        const viewport = viewportRef.current;
        const size = diagramSize.current;
        if (!viewport || !size || !viewport.clientWidth || !viewport.clientHeight) return;
        const scale = Math.min(
            Math.max(1, viewport.clientWidth - FIT_MARGIN * 2) / size.width,
            Math.max(1, viewport.clientHeight - FIT_MARGIN * 2) / size.height,
            1
        );
        saveTransform({
            scale,
            x: (viewport.clientWidth - size.width * scale) / 2,
            y: (viewport.clientHeight - size.height * scale) / 2
        });
    }, [saveTransform]);

    /**
     * Zoom while keeping the diagram location under the anchor fixed.
     * Normal zoom is limited to 5% through 800%. Fit may produce a smaller scale;
     * zooming out then stays put, and zooming in increases gradually from that scale.
     * @param factor - Positive multiplier. Above 1 enlarges, below 1 shrinks.
     * @param x - Anchor x in CSS pixels from the viewport's inner left edge.
     * @param y - Anchor y in CSS pixels from the viewport's inner top edge.
     * @returns No value. Save a changed view. Ignore missing SVGs or invalid factors.
     */
    const zoomAt = useCallback((factor: number, x: number, y: number) => {
        const current = view.current;
        if (!current || !diagramSize.current || !Number.isFinite(factor) || factor <= 0) return;
        const minimum = Math.min(MIN_SCALE, current.scale);
        const scale = Math.min(MAX_SCALE, Math.max(minimum, current.scale * factor));
        if (scale === current.scale) return;
        const ratio = scale / current.scale;
        saveTransform({
            scale,
            x: x - (x - current.x) * ratio,
            y: y - (y - current.y) * ratio
        });
    }, [saveTransform]);

    /**
     * Zoom around the viewport center rather than the mouse position.
     * @param factor - Positive multiplier forwarded to zoomAt.
     * @returns No value. Does nothing if the viewport is not mounted.
     */
    const zoomFromCenter = (factor: number) => {
        const viewport = viewportRef.current;
        if (viewport) zoomAt(factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
    };

    /**
     * End any active drag, clear its cursor, and release pointer capture if held.
     * Takes no arguments. Clear the ref before release because release may emit an event.
     * @returns No value. The last position remains saved in Context.
     */
    const stopDragging = useCallback(() => {
        const current = drag.current;
        drag.current = null;
        if (!current) return;
        delete current.target.dataset.dragging;
        if (current.target.hasPointerCapture(current.pointerId)) {
            current.target.releasePointerCapture(current.pointerId);
        }
    }, []);

    /**
     * Prepare for SVG replacement. Takes no arguments. End dragging, disable
     * controls, and clear the old SVG and styles. Keep the Context view for restoration.
     * @returns No value. Does not render an SVG or reset the saved direction or transform.
     */
    const prepareDiagram = useCallback(() => {
        stopDragging();
        diagramSize.current = null;
        const diagram = mermaidRef.current;
        if (diagram) {
            diagram.style.transform = '';
            diagram.style.width = '';
            diagram.style.height = '';
            diagram.replaceChildren();
        }
        if (viewportRef.current) delete viewportRef.current.dataset.ready;
    }, [stopDragging]);

    /**
     * Initialize a newly inserted SVG. Takes no arguments. Cache its viewBox size,
     * use that natural size for layout, then restore the saved transform or run Fit.
     * @returns No value. Missing SVGs or invalid viewBox dimensions leave controls disabled.
     */
    const restoreDiagram = useCallback(() => {
        const diagram = mermaidRef.current;
        const svg = diagram?.querySelector('svg');
        if (!diagram || !svg) return;
        const { width, height } = svg.viewBox.baseVal;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        diagramSize.current = { width, height };
        svg.style.width = diagram.style.width = `${width}px`;
        svg.style.height = diagram.style.height = `${height}px`;
        svg.style.maxWidth = 'none';
        if (viewportRef.current) viewportRef.current.dataset.ready = 'true';
        if (view.current) applyTransform(view.current);
        else fitDiagram();
    }, [applyTransform, fitDiagram]);

    // End dragging when hidden. Initialize Fit once a new SVG becomes measurable,
    // without replacing a view the user has already chosen.
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const observer = new ResizeObserver(() => {
            if (!viewport.clientWidth || !viewport.clientHeight) stopDragging();
            else if (!view.current) fitDiagram();
        });
        observer.observe(viewport);
        return () => {
            observer.disconnect();
            stopDragging();
        };
    }, [fitDiagram, stopDragging]);

    // A native non-passive listener allows modified wheel events to prevent browser zoom.
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        /**
         * Zoom at the mouse position with Ctrl or Cmd. Plain and horizontal-only
         * wheel events keep their default behavior. The border is excluded from the anchor.
         * @param event - Native wheel event with client coordinates and modifier keys.
         * @returns No value. Prevent default behavior only for a ready SVG and vertical delta.
         */
        const onWheel = (event: WheelEvent) => {
            if ((!event.ctrlKey && !event.metaKey) || !event.deltaY || !diagramSize.current) return;
            event.preventDefault();
            const rect = viewport.getBoundingClientRect();
            zoomAt(
                event.deltaY < 0 ? 1.1 : 0.9,
                event.clientX - rect.left - viewport.clientLeft,
                event.clientY - rect.top - viewport.clientTop
            );
        };
        viewport.addEventListener('wheel', onWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', onWheel);
    }, [zoomAt]);

    /**
     * Begin a drag with the primary pointer and button 0. Capture it for movement outside the viewport.
     * @param event - React pointer-down event from the viewport.
     * @returns No value. Ignore missing SVGs, other buttons, or an already active drag.
     */
    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !event.isPrimary || !diagramSize.current || drag.current) return;
        event.preventDefault();
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: event.currentTarget };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = 'true';
    };

    /**
     * Pan by the pointer displacement since the previous event, preserving scale.
     * @param event - React pointer movement event. Only the active pointer is accepted.
     * @returns No value. Save the new position, or ignore events without an active drag and view.
     */
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        const currentView = view.current;
        if (!current || !currentView || current.pointerId !== event.pointerId) return;
        saveTransform({
            ...currentView,
            x: currentView.x + event.clientX - current.x,
            y: currentView.y + event.clientY - current.y
        });
        current.x = event.clientX;
        current.y = event.clientY;
    };

    /**
     * Finish a drag on release, cancellation, or loss of pointer capture.
     * @param event - React pointer event. Events from a different pointer are ignored.
     * @returns No value. Release resources through stopDragging and preserve the saved view.
     */
    const endDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId === event.pointerId) stopDragging();
    };

    /**
     * Update direction while keeping the user's scale and position.
     * @param event - Select change event. Accepted values are TB and LR.
     * @returns No value. Update Context for valid values and leave unsupported values unchanged.
     */
    const changeDirection = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextDirection = event.target.value;
        if (nextDirection === 'TB' || nextDirection === 'LR') {
            setDiagramViewState(previous => previous.direction === nextDirection
                ? previous
                : { ...previous, direction: nextDirection });
        }
    };

    /**
     * Apply the selected direction to the first matching graph or flowchart declaration.
     * @param text - Mermaid source text before rendering.
     * @returns Text with its existing TB, TD, BT, LR or RL direction replaced.
     * Return unchanged text when no declaration matches. Does not update Context or DOM.
     */
    const applyDirection = useCallback((text: string) => text.replace(
        /^(\s*(?:graph|flowchart)\s+)(?:TB|TD|BT|LR|RL)\b/m,
        `$1${direction}`
    ), [direction]);

    return {
        viewportRef,
        mermaidRef,
        prepareDiagram,
        restoreDiagram,
        fitDiagram,
        /** Takes no arguments. Zoom in by 1.25 around the center and return no value. */
        zoomIn: () => zoomFromCenter(ZOOM_FACTOR),
        /** Takes no arguments. Zoom out by 0.8 around the center and return no value. */
        zoomOut: () => zoomFromCenter(1 / ZOOM_FACTOR),
        applyDirection,
        /** Controlled select value and handler. Both are backed by Context. */
        directionSelectProps: { value: direction, onChange: changeDirection },
        /** Spread onto the viewport to handle drag start, movement and completion. */
        pointerHandlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onLostPointerCapture: endDrag
        }
    };
}
