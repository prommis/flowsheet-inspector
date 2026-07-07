import { useEffect, useState, useContext } from "react";
import type { idaesRunInfo } from "../interface/interface";
import { AppContext } from "../context";
import { vscode } from '../vscode';
import TreeNavBar from "./treeviewNav";
import css from "../css/tree_app.module.css";

export default function FlowsheetSteps({ idaesRunInfo, setShowConfig }: { idaesRunInfo: idaesRunInfo, setShowConfig: React.Dispatch<React.SetStateAction<boolean>> }) {
    const { setSelectedSteps, isLoading, initError, openPythonFiles, activateFileName, stepStatuses, isRunningFlowsheet } = useContext(AppContext);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

    /**
     * Renders the trailing status icon for a step, floated to the end of the row.
     *
     * The `status` table only gains a row once a step *finishes*, so the step
     * currently executing has no recorded status yet. We infer it: while a run
     * is in progress and no earlier step has errored, the first step without a
     * recorded status is the one running (spinner). Completed steps show a green
     * check (success) or red cross (error); steps not yet reached show nothing.
     *
     * @param stepName - Name of the step (matches the `status` table step_name).
     * @param isRunningCandidate - True if this is the earliest not-yet-completed
     *   step in the sequence, i.e. the one currently executing during a run.
     * @returns The icon element, or null when the step has no status to show.
     */
    const renderStepIcon = (stepName: string, isRunningCandidate: boolean) => {
        const status = stepStatuses[stepName];
        if (status?.state === 'success') {
            return <span className={`${css.step_status_icon} ${css.step_status_success}`} title="Completed">✓</span>;
        }
        if (status?.state === 'error') {
            return <span className={`${css.step_status_icon} ${css.step_status_error}`} title={status.errmsg || 'Step failed'}>✕</span>;
        }
        if (isRunningCandidate) {
            return <span className={`${css.step_status_icon} ${css.step_status_running}`} title="Running" />;
        }
        return null;
    };
    // const focuseView = useRef<HTMLSelectElement>(null)

    const handleOpenView = (target: string) => {
        vscode.postMessage({
            frontendInstruction: 'focus_view',
            fromPanel: 'treeView',
            target: target
        });
    };

    const handleDocumentSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const targetPath = e.target.value;
        if (targetPath) {
            vscode.postMessage({
                frontendInstruction: 'focus_document',
                fromPanel: 'treeView',
                target: targetPath
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
            // The currently-running step is the first one (in sequence) that has
            // no recorded status yet, provided a run is in progress and no earlier
            // step has failed. Steps run as a contiguous prefix, so this is the
            // step being executed right now.
            const firstPendingIndex = idaesRunInfo.steps.findIndex(s => !stepStatuses[s]);
            const anyFailed = idaesRunInfo.steps.some(s => stepStatuses[s]?.state === 'error');
            const runningIndex = isRunningFlowsheet && !anyFailed ? firstPendingIndex : -1;

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
                        {renderStepIcon(step, index === runningIndex)}
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
            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', margin: '0 0 10px 0', fontSize: '13px', color: 'var(--vscode-foreground)' }}>
                    Flowsheet to inspect:
                </label>
                <select 
                    style={{ width: '100%', padding: '6px', backgroundColor: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)', border: '1px solid var(--vscode-dropdown-border)', borderRadius: '2px', cursor: 'pointer' }}
                    onChange={handleDocumentSelection}
                    value={openPythonFiles?.find(f => f.name === activateFileName)?.path || ""}
                >
                    <option value="" disabled>Select a flowsheet...</option>
                    {openPythonFiles?.map((f, i) => (
                        <option key={i} value={f.path}>{f.name}</option>
                    ))}
                </select>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: 'var(--vscode-descriptionForeground, #cccccc)', fontStyle: 'italic' }}>
                    Open the flowsheet in editor to select
                </p>
            </div>

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