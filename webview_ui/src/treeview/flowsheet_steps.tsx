import { useEffect, useState, useContext } from "react";
import type { idaesRunInfo } from "../interface/interface";
import { AppContext } from "../context";
import { vscode } from '../vscode';
import TreeNavBar from "./treeviewNav";
import css from "../css/tree_app.module.css";

export default function FlowsheetSteps({ idaesRunInfo, setShowConfig }: { idaesRunInfo: idaesRunInfo, setShowConfig: React.Dispatch<React.SetStateAction<boolean>> }) {
    const { setSelectedSteps, isLoading, initError } = useContext(AppContext);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    // const focuseView = useRef<HTMLSelectElement>(null)

    const handleOpenView = (target: string) => {
        vscode.postMessage({
            frontendInstruction: 'focus_view',
            fromPanel: 'treeView',
            target: target
        });
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
            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--vscode-foreground)' }}>
                Select Steps to Run:
            </p>
            <div className={`${css.steps_container}`}>
                {stepDisplay()}
            </div>

            <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <TreeNavBar setShowConfig={setShowConfig} />

                <div className={`${css.open_results_view_container}`}>
                    <button
                        className={`${css.open_results_view_select}`}
                        style={{
                            width: '100%',
                            padding: '8px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--vscode-editor-foreground)',
                            color: 'var(--vscode-editor-foreground)',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundImage: 'none'
                        }}
                        onClick={() => handleOpenView('webview')}
                    >
                        Open Inspector Results Panel ↗
                    </button>
                </div>
            </div>
        </div>
    );
}