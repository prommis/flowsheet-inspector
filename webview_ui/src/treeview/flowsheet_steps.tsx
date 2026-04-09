import { useEffect, useState, useRef, useContext } from "react";
import type { idaesRunInfo } from "../interface/interface";
import { AppContext } from "../context";
import { vscode } from '../vscode';
import css from "../css/tree_app.module.css";

export default function FlowsheetSteps({ idaesRunInfo }: { idaesRunInfo: idaesRunInfo }) {
    const { setSelectedSteps, isLoading, initError } = useContext(AppContext);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const focuseView = useRef<HTMLSelectElement>(null)

    const handleOpenView = () => {
        const selected = focuseView.current?.value;
        if (selected) {
            vscode.postMessage({
                frontendInstruction: 'focus_view',
                fromPanel: 'treeView',
                target: selected
            });
        }
    };

    /**
     * Handle step selector checkbox change.
     * Selecting a step automatically selects all preceding steps (0 to index).
     * Unchecking a step removes it and all subsequent steps, keeping only 0 to index-1.
     * @param event - checkbox change event
     * @param index - the index of the clicked step checkbox
     */
    const stepSelectorHandler = (event: React.ChangeEvent<HTMLInputElement>, index: number) => {

        let newSteps = [];
        if (event.target.checked) {
            // Add index and sort
            newSteps = Array.from({ length: index + 1 }, (_, i) => i);
        } else {
            newSteps = Array.from({ length: index }, (_, i) => i);
            newSteps = newSteps.sort((a, b) => a - b);
        }
        setSelectedIndices(newSteps);
        // Write selected step NAMES to context
        const stepNames = newSteps.map(i => idaesRunInfo.steps[i]).filter(Boolean);
        setSelectedSteps(stepNames);
    };

    // generate flowsheet steps
    const stepDisplay = () => {
        if (isLoading) {
            console.log('loading idaes-extension-steps');
            return (
                <div>
                    <p>Building idaes-extension-steps...</p>
                </div>
            )
        }

        if (initError) {
            return (
                <div style={{ padding: '10px', backgroundColor: 'var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1))', border: '1px solid var(--vscode-inputValidation-errorBorder, red)', color: 'var(--vscode-errorForeground, red)', borderRadius: '4px', marginTop: '15px' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>{initError}</p>
                </div>
            )
        }

        // no config data
        if (!idaesRunInfo) {
            return (
                <div>
                    <p>Loading config data...</p>
                </div>
            )
        }

        // has config data but no steps
        const configDataSteps = Object.keys(idaesRunInfo);
        if (!configDataSteps.includes("steps")) {
            return (
                <div>
                    <h2>Steps Display</h2>
                    <p>Config data loaded successfully, but no steps in config data</p>
                </div>
            )
        }

        // has config data and steps but steps is empty
        if (configDataSteps.includes("steps") && configDataSteps.length === 0) {
            return (
                <div>
                    <h2>Step Display</h2>
                    <p>Config data loaded successfully, has steps but steps is empty</p>
                </div>
            )
        }

        // build step displays
        if (configDataSteps.includes("steps") && idaesRunInfo.steps && idaesRunInfo.steps.length > 0) {
            const stepDisplays = idaesRunInfo.steps.map((step: string, index: number) => {
                return (
                    <div key={step + index}
                        className={`${css.step_selector_container}`}
                    >
                        <input
                            type="checkbox"
                            id={`step_${index}`}
                            className={`${css.step_selector_checkbox}`}
                            checked={selectedIndices.includes(index)}
                            onChange={(e) => stepSelectorHandler(e, index)}
                        />
                        <label htmlFor={`${index}`}>{step}</label>
                    </div>
                )
            })
            return stepDisplays;
        }
    }

    useEffect(() => {
        console.log('Selected steps:', selectedIndices);
    }, [selectedIndices]);

    return (
        <div className={`${css.flowsheet_steps_main_container}`}>
            <div className={`${css.steps_container}`}>
                {stepDisplay()}
            </div>
            <div className={`${css.open_results_view_container}`}>
                <label
                    htmlFor="open_results_view"
                    className={`${css.open_results_view_label}`}
                >Focus on the view:</label>
                <select
                    ref={focuseView}
                    className={`${css.open_results_view_select}`}
                    onChange={() => handleOpenView()}
                >
                    <option value="">Open Results View</option>
                    <option value="webview">Flowsheet Variables View</option>
                    <option value="mermaid">Diagram View</option>
                </select>
            </div>
        </div>
    );
}