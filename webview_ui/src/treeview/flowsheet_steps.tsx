import { useEffect, useState, useContext } from "react";
import type { idaesRunInfo } from "../interface/interface";
import { AppContext } from "../context";
import { vscode } from '../vscode';
import TreeNavBar from "./treeviewNav";
import css from "../css/tree_app.module.css";

export default function FlowsheetSteps({ idaesRunInfo }: { idaesRunInfo: idaesRunInfo }) {
    const { setSelectedSteps, isLoading, initError, packageWarnings, openPythonFiles, activateFileName, currentPythonEnv, stepStatuses, isRunningFlowsheet } = useContext(AppContext);
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
        if (status?.state === 'solver_failed') {
            return <span className={`${css.step_status_icon} ${css.step_status_solver_failed}`} title={status.errmsg || 'Solver did not find a solution'}>✕</span>;
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

    const handleCopyInterpreterPath = () => {
        if (currentPythonEnv?.path) {
            navigator.clipboard.writeText(currentPythonEnv.path);
        }
    };

    const handleChangeInterpreter = () => {
        vscode.postMessage({
            frontendInstruction: 'open_interpreter_picker',
            fromPanel: 'treeView',
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
                <div className={css.init_error_box}>
                    <p className={css.init_error_text}>{initError}</p>
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
            const anyFailed = idaesRunInfo.steps.some(s => {
                const st = stepStatuses[s]?.state;
                return st === 'error' || st === 'solver_failed';
            });
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
        <div className={css.flowsheet_steps_main_container}>
            <div className={css.flowsheet_file_section}>
                <label className={css.section_label}>
                    Flowsheet to inspect:
                </label>
                <select
                    className={css.dropdown_select}
                    onChange={handleDocumentSelection}
                    value={openPythonFiles?.find(f => f.name === activateFileName)?.path || ""}
                >
                    <option value="" disabled>Select a flowsheet...</option>
                    {openPythonFiles?.map((f, i) => (
                        <option key={i} value={f.path}>{f.name}</option>
                    ))}
                </select>
                <p className={css.section_hint}>
                    Open the flowsheet in editor to select
                </p>
            </div>

            <div className={css.python_env_container}>
                <label className={css.python_env_label}>
                    Current Python:
                </label>
                <div className={css.python_env_actions}>
                    <span className={css.python_env_path_text}>
                        {currentPythonEnv?.name || currentPythonEnv?.path || "No interpreter selected"}
                    </span>
                    <button
                        className={css.python_env_icon_btn}
                        onClick={handleCopyInterpreterPath}
                        title="Copy interpreter path"
                        disabled={!currentPythonEnv?.path}
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="4" y="4" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                            <rect x="2" y="2" width="8" height="9" rx="1" fill="var(--vscode-sideBar-background, #1e1e1e)" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                    </button>
                </div>
                <button
                    className={css.change_interpreter_btn}
                    onClick={handleChangeInterpreter}
                >
                    Change Interpreter…
                </button>
                {packageWarnings && packageWarnings.length > 0 && (
                    <div className={css.package_warnings_container}>
                        {packageWarnings.map((w) => (
                            <div key={w.name} className={css.package_warning_item}>
                                <span className={css.package_warning_title}>
                                    Missing package: {w.name}
                                </span>
                                <span className={css.package_warning_cmd}>
                                    {w.install_command}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <p className={css.section_label}>
                Select Steps to Run:
            </p>
            <div className={css.steps_container}>
                {stepDisplay()}
            </div>

            <div className={css.steps_actions_footer}>
                <TreeNavBar />

                <div className={css.open_results_view_container}>
                    <button
                        className={css.open_results_view_btn}
                        onClick={() => handleOpenView('webview')}
                    >
                        Open Inspector Results Panel ↗
                    </button>
                </div>
            </div>
        </div>
    );
}
