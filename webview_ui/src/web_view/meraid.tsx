import { useContext, useEffect, useId, useRef } from "react";
import { AppContext } from "../context";
import { useDiagramControl, useResetDiagramViewOnResult } from "../util/diagram_control";

import mermaid from "mermaid";
import { postReloadMermaidDone } from '../util/post_message';
import css from '../css/mermaid.module.css';
import type { Diagnostics } from "../interface/flowsheet_result_interface";

export default function Mermaid() {
    const { flowsheetRunnerResult } = useContext(AppContext);
    useResetDiagramViewOnResult();
    const {
        viewportRef, mermaidRef, prepareDiagram, restoreDiagram,
        fitDiagram, zoomIn, zoomOut, applyDirection, directionSelectProps, pointerHandlers
    } = useDiagramControl();
    const renderIdCounter = useRef(0);
    const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

    const diagnostics = flowsheetRunnerResult?.actions?.diagnostics as Diagnostics | undefined;
    const runFailed = !!flowsheetRunnerResult && diagnostics?.valid === false;

    useEffect(() => {
        // initial mermaid
        mermaid.initialize({ startOnLoad: false, theme: 'dark', flowchart: { useMaxWidth: false } });
    }, []);

    useEffect(() => {
        if (!mermaidRef.current) return;
        prepareDiagram();

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

        const diagramText = applyDirection(filteredDiagram.join('\n'));
        console.log(`mermaid diagram text:\n${diagramText}`);

        // Ignore an older render after a direction change or tab switch.
        let cancelled = false;
        const renderDiagram = async () => {
            try {
                renderIdCounter.current += 1;
                const uniqueId = `mermaid-diagram-${renderId}-${renderIdCounter.current}`;
                const { svg } = await mermaid.render(uniqueId, diagramText);
                if (!cancelled && mermaidRef.current) {
                    mermaidRef.current.innerHTML = svg;
                    restoreDiagram();
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
                if (!cancelled) postReloadMermaidDone({ reload_mermaid: 'done' });
            }
        };
        renderDiagram();
        return () => { cancelled = true; };

    }, [flowsheetRunnerResult, applyDirection, runFailed, renderId, mermaidRef, prepareDiagram, restoreDiagram]);

    return (
        <div className={`${css.mermaid_container}`}>
            <h2 className="page-title">Diagram:</h2>
            <div className={css.toolbar}>
                <label className={css.direction_control}>
                    Direction:{' '}
                    <select {...directionSelectProps}>
                        <option value="TB">Top to Bottom</option>
                        <option value="LR">Left to Right</option>
                    </select>
                </label>
                <button type="button" onClick={zoomIn}>Zoom In</button>
                <button type="button" onClick={zoomOut}>Zoom Out</button>
                <button type="button" onClick={fitDiagram}>Fit</button>
            </div>
            <p className={css.hint}>Drag to pan. Hold Ctrl or Cmd and scroll to zoom.</p>
            <div
                ref={viewportRef}
                className={css.diagram_container}
                aria-label="Flowsheet diagram"
                {...pointerHandlers}
            >
                <div ref={mermaidRef} className={`${css.diagram}`}></div>
            </div>
        </div>
    );
}

