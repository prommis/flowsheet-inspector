import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../context";

import mermaid from "mermaid";
import { postReloadMermaidDone } from '../util/post_message';
import css from '../css/mermaid.module.css';
import type { Diagnostics } from "../interface/flowsheet_result_interface";

export default function Mermaid() {
    const { flowsheetRunnerResult } = useContext(AppContext);
    const mermaidRef = useRef<HTMLDivElement>(null);
    const renderIdCounter = useRef(0);
    // This state increments on every mount, ensuring useEffect always re-runs
    const [mountKey, setMountKey] = useState(0);

    const diagnostics = flowsheetRunnerResult?.actions?.diagnostics as Diagnostics | undefined;
    const runFailed = !!flowsheetRunnerResult && diagnostics?.valid === false;

    useEffect(() => {
        // initial mermaid
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        // Trigger a re-render on mount so the diagram effect runs
        setMountKey(k => k + 1);
    }, []);

    useEffect(() => {
        // no mermaid ref found
        if (!mermaidRef.current) return;

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

        const diagramText = filteredDiagram.join('\n');
        console.log(`mermaid diagram text:\n${diagramText}`);

        // Use mermaid.render() with a unique ID each time to avoid ID conflicts
        // when the component is re-mounted after tab switches
        const renderDiagram = async () => {
            try {
                renderIdCounter.current += 1;
                const uniqueId = `mermaid-diagram-${renderIdCounter.current}`;
                const { svg } = await mermaid.render(uniqueId, diagramText);
                if (mermaidRef.current) {
                    mermaidRef.current.innerHTML = svg;
                }
            } catch (error) {
                console.error('mermaid render error:', error);
                if (mermaidRef.current) {
                    mermaidRef.current.innerHTML = `
                    <p style="color: #f88;">Mermaid render error: ${error}</p>
                    <pre style="color: #888; font-size: 12px;">${diagramText}</pre>`;
                }
            }
        };
        renderDiagram();
        postReloadMermaidDone({ reload_mermaid: 'done' });

    }, [flowsheetRunnerResult, mountKey]);

    return (
        <div className={`${css.mermaid_container}`}>
            <h2 className="page-title">Diagram:</h2>
            {/* Leave this div empty — mermaid.run() will inject the SVG via innerHTML */}
            <div className={`${css.diagram_container}`}>
                <div ref={mermaidRef} className={`${css.diagram}`}></div>
            </div>
        </div>
    );
}

