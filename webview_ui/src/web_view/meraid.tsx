import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AppContext } from "../context";

import mermaid from "mermaid";
import { postReloadMermaidDone } from '../util/post_message';
import css from '../css/mermaid.module.css';
import type { Diagnostics } from "../interface/flowsheet_result_interface";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export default function Mermaid() {
    const {
        flowsheetRunnerResult,
        diagramDirection,
        setDiagramDirection,
        diagramZoom,
        setDiagramZoom
    } = useContext(AppContext);
    // A new report or direction needs its own completed SVG before zoom is usable.
    const renderRequest = useMemo(() => ({
        result: flowsheetRunnerResult,
        direction: diagramDirection,
    }), [flowsheetRunnerResult, diagramDirection]);
    const [completedRequest, setCompletedRequest] = useState<typeof renderRequest | null>(null);
    const isDiagramReady = !!flowsheetRunnerResult && completedRequest === renderRequest;
    const mermaidRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef(diagramZoom);
    const zoomAnchorRef = useRef<{
        svg: SVGSVGElement;
        x: number;
        y: number;
        clientX: number;
        clientY: number;
    } | null>(null);
    const renderIdCounter = useRef(0);

    const diagnostics = flowsheetRunnerResult?.actions?.diagnostics as Diagnostics | undefined;
    const runFailed = !!flowsheetRunnerResult && diagnostics?.valid === false;

    useLayoutEffect(() => {
        zoomRef.current = diagramZoom;
        const anchor = zoomAnchorRef.current;
        zoomAnchorRef.current = null;
        const viewport = viewportRef.current;
        if (!anchor || !viewport || !mermaidRef.current?.contains(anchor.svg)) return;

        // After CSS resizes the SVG, keep the same diagram point under the
        // pointer. Native scrolling clamps the position at the diagram edges.
        const bounds = anchor.svg.getBoundingClientRect();
        viewport.scrollLeft += bounds.left + anchor.x * bounds.width - anchor.clientX;
        viewport.scrollTop += bounds.top + anchor.y * bounds.height - anchor.clientY;
    }, [diagramZoom]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || !isDiagramReady) return;

        const handleWheel = (event: WheelEvent) => {
            if (!event.ctrlKey || event.deltaY === 0) return;
            const svg = mermaidRef.current?.querySelector("svg");
            if (!svg) return;
            const bounds = svg.getBoundingClientRect();
            if (bounds.width <= 0 || bounds.height <= 0) return;

            event.preventDefault();
            // Wheel devices report pixels, lines, or pages. Normalize to pixels.
            const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientHeight : 1;
            const nextZoom = Math.min(MAX_ZOOM, Math.max(
                MIN_ZOOM, zoomRef.current * Math.exp(-event.deltaY * unit * 0.002)
            ));
            if (nextZoom === zoomRef.current) return;

            zoomAnchorRef.current = {
                svg,
                x: (event.clientX - bounds.left) / bounds.width,
                y: (event.clientY - bounds.top) / bounds.height,
                clientX: event.clientX,
                clientY: event.clientY,
            };
            zoomRef.current = nextZoom;
            setDiagramZoom(nextZoom);
        };

        // A non-passive listener lets Ctrl+wheel zoom only the diagram.
        viewport.addEventListener("wheel", handleWheel, { passive: false });
        return () => viewport.removeEventListener("wheel", handleWheel);
    }, [setDiagramZoom, isDiagramReady]);

    useEffect(() => {
        // initial mermaid
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    }, []);

    useEffect(() => {
        // no mermaid ref found
        if (!mermaidRef.current) return;
        zoomAnchorRef.current = null;

        // 1. Not run yet
        if (!flowsheetRunnerResult) {
            mermaidRef.current.innerHTML = `
            <div style="padding: 20px; color: var(--vscode-descriptionForeground, #888); text-align: center; margin-top: 20px;">
                <p style="font-size: 1.1em; margin-bottom: 10px;">No Diagram Available Yet</p>
                <p>Click <strong>Run</strong> in the IDAES Tree View to execute the flowsheet and generate a diagram.</p>
            </div>`;
            return;
        }

        // 2. Run failed — diagram is empty because after_run() was not called
        if (runFailed && (!flowsheetRunnerResult.actions.mermaid_diagram || !flowsheetRunnerResult.actions.mermaid_diagram.diagram)) {
            const lastRun = flowsheetRunnerResult.last_run ?? [];
            mermaidRef.current.innerHTML = `
            <div style="color: var(--vscode-editorError-foreground, #f88); padding: 10px; border: 1px solid var(--vscode-editorError-foreground, #f88); border-radius: 4px; margin-top: 10px; background-color: var(--vscode-editorError-background, transparent);">
                <p style="margin: 0 0 10px 0; font-weight: bold;">fi-run has issues: Diagram Unavailable</p>
                <p style="margin: 0 0 10px 0; color: var(--vscode-editor-foreground, #ccc);">
                    The flowsheet run may have failed or did not reach the solve step.
                    ${lastRun.length > 0 ? `Last completed steps: ${lastRun.join(' → ')}.` : ''}
                </p>
                <p style="margin: 0;">Check the error log for details.</p>
            </div>`;
            postReloadMermaidDone({ reload_mermaid: 'done' });
            return;
        }

        // 3. Ran successfully, but no diagram found in result (e.g. idaes-connectivity not installed)
        if (
            !flowsheetRunnerResult.actions.mermaid_diagram ||
            !flowsheetRunnerResult.actions.mermaid_diagram.diagram
        ) {
            mermaidRef.current.innerHTML = `
            <div style="color: var(--vscode-editorError-foreground, #f88); padding: 10px; border: 1px solid var(--vscode-editorError-foreground, #f88); border-radius: 4px; margin-top: 10px; background-color: var(--vscode-editorError-background, transparent);">
                <p style="margin: 0 0 10px 0; font-weight: bold;">
                    Mermaid Diagram Missing
                </p>
                <p style="margin: 0 0 10px 0; color: var(--vscode-editor-foreground, #ccc);">
                    The IDAES runner result does not contain a Mermaid diagram.
                </p>
                <p style="margin: 0;">
                    <strong>Reason:</strong> The <code>idaes-connectivity</code> Python package is likely not installed in your IDAES environment.
                    Please run <code>pip install idaes-connectivity</code> or equivalent in your terminal and run the flowsheet again.
                </p>
            </div>`;
            postReloadMermaidDone({ reload_mermaid: 'done' });
            return;
        }

        // get diagram from flowsheet runner result
        const mermaidDiagram = flowsheetRunnerResult.actions.mermaid_diagram.diagram;

        // Normalize: handle both array and string
        let lines: string[] = [];
        if (typeof mermaidDiagram === 'string') {
            lines = mermaidDiagram.split('\n');
        } else if (Array.isArray(mermaidDiagram)) {
            lines = mermaidDiagram;
        } else {
            console.error('Unknown mermaid diagram format', mermaidDiagram);
        }

        // Filter out empty strings
        const filteredDiagram = lines.filter((line: string) => line.trim() !== '');

        // Check if there's actual content beyond just the direction declaration
        if (filteredDiagram.length <= 1) {
            console.log('mermaid diagram has no actual content (no nodes/edges)');
            mermaidRef.current.innerHTML = `
            <p style="color: #888;">
                No diagram data available for this flowsheet.<br/>
                Extension returned Mermaid content is: ${filteredDiagram.join(', ')}
            </p>`;
            postReloadMermaidDone({ reload_mermaid: 'done' });
            return;
        }

        const diagramText = filteredDiagram
        .join('\n')
        .replace(

            /^(\s*(?:graph|flowchart)\s+)(?:TB|TD|BT|LR|RL)\b/m,
            `$1${diagramDirection}`
        );
        console.log(`mermaid diagram text:\n${diagramText}`);

        // Use mermaid.render() with a unique ID each time to avoid ID conflicts
        // when the component is re-mounted after tab switches
        let cancelled = false;
        const renderDiagram = async () => {
            try {
                renderIdCounter.current += 1;
                const uniqueId = `mermaid-diagram-${renderIdCounter.current}`;
                const { svg } = await mermaid.render(uniqueId, diagramText);
                if (!cancelled && mermaidRef.current) {
                    mermaidRef.current.innerHTML = svg;
                    const svgElement =
                        mermaidRef.current.querySelector("svg");

                    if (svgElement) {
                        const naturalWidth = svgElement.viewBox.baseVal.width;

                        if (naturalWidth > 0 && svgElement.viewBox.baseVal.height > 0) {
                            svgElement.style.setProperty(
                                "--diagram-natural-width",
                                `${naturalWidth}px`
                            );
                            setCompletedRequest(renderRequest);
                        }
                    }
                }
            } catch (error) {
                if (cancelled) return;
                console.error('mermaid render error:', error);
                if (mermaidRef.current) {
                    mermaidRef.current.innerHTML = `
                    <p style="color: #f88;">Mermaid render error: ${error}</p>
                    <pre style="color: #888; font-size: 12px;">${diagramText}</pre>`;
                }
            } finally {
                if (!cancelled) {
                    postReloadMermaidDone({ reload_mermaid: 'done' });
                }
            }
        };
        renderDiagram();
        return () => { cancelled = true; };

    }, [renderRequest]);

    return (
        <div className={`${css.mermaid_container}`}>
            <h2 className="page-title">Diagram:</h2>
            <div className={css.diagram_toolbar}>
                <label className={css.direction_control}>
                    Direction:{' '}
                    <select
                        value={diagramDirection}
                        onChange={(event) => {
                            const direction = event.target.value;
                            if (direction === 'TB' || direction === 'LR') {
                                setDiagramDirection(direction);
                            }
                        }}
                    >
                        <option value="TB">Top to Bottom</option>
                        <option value="LR">Left to Right</option>
                    </select>
                </label>

                <div
                    className={css.zoom_controls}
                    role="group"
                    aria-label="Diagram zoom"
                >
                    <button
                        type="button"
                        aria-label="Zoom out"
                        disabled={!isDiagramReady || diagramZoom <= MIN_ZOOM}
                        onClick={() =>
                            setDiagramZoom((zoom) => Math.max(MIN_ZOOM, zoom - 0.25))
                        }
                    >
                        −
                    </button>

                    <span>{Math.round(diagramZoom * 100)}%</span>

                    <button
                        type="button"
                        aria-label="Zoom in"
                        disabled={!isDiagramReady || diagramZoom >= MAX_ZOOM}
                        onClick={() =>
                            setDiagramZoom((zoom) => Math.min(MAX_ZOOM, zoom + 0.25))
                        }
                    >
                        +
                    </button>

                    <button
                        type="button"
                        disabled={!isDiagramReady}
                        onClick={() => setDiagramZoom(1)}
                    >
                        Reset
                    </button>
                </div>
            </div>
            {/* Leave this div empty — mermaid.run() will inject the SVG via innerHTML */}
            <div
                ref={viewportRef}
                className={css.diagram_container}
                title={isDiagramReady ? "Hold Ctrl and scroll to zoom" : undefined}
            >
                <div
                    ref={mermaidRef}
                    className={css.diagram}
                    style={{ "--diagram-zoom": diagramZoom } as CSSProperties}
                ></div>
            </div>
        </div>
    );
}

