import { useEffect, useState, useContext } from "react";
import type { idaesRunInfo } from "../interface/interface";
import { AppContext } from "../context";
import { vscode } from '../vscode';
import TreeNavBar from "./treeviewNav";
import css from "../css/tree_app.module.css";

export default function FlowsheetSteps({ idaesRunInfo, setShowConfig }: { idaesRunInfo: idaesRunInfo, setShowConfig: React.Dispatch<React.SetStateAction<boolean>> }) {
    const { setSelectedSteps, isLoading, initError, openPythonFiles, activateFileName, pythonEnvInfo } = useContext(AppContext);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
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
     * Handle selection in the "Current Python" environment dropdown.
     * Sends a `change_python_env` instruction to the extension host, which
     * switches VS Code's active interpreter (same effect as the status-bar
     * picker). The extension then fires an env-change event that re-runs
     * fi-steps and broadcasts the refreshed env list back, so the dropdown,
     * the status bar, and the step list all stay in sync.
     * @param e - select change event; `value` is the interpreter's absolute path
     */
    const handlePythonEnvSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const envPath = e.target.value;
        if (envPath) {
            vscode.postMessage({
                frontendInstruction: 'change_python_env',
                fromPanel: 'treeView',
                envPath: envPath
            });
        }
    };

    const handleCopyInterpreterPath = () => {
        const path = pythonEnvInfo?.current?.path;
        if (path) {
            navigator.clipboard.writeText(path);
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
                        {pythonEnvInfo?.current?.path || "No interpreter selected"}
                    </span>
                    <button
                        className={css.python_env_icon_btn}
                        onClick={handleCopyInterpreterPath}
                        title="Copy interpreter path"
                        disabled={!pythonEnvInfo?.current?.path}
                    >
                        {/* two overlapping rectangles copy icon */}
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="4" y="4" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                            <rect x="2" y="2" width="8" height="9" rx="1" fill="var(--vscode-sideBar-background, #1e1e1e)" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                    </button>
                </div>
                <select
                    className={css.dropdown_select}
                    onChange={handlePythonEnvSelection}
                    value={pythonEnvInfo?.current?.path || ""}
                >
                    <option value="" disabled>Select a Python environment...</option>
                    {pythonEnvInfo?.envs.map((env, i) => (
                        <option key={i} value={env.path}>{env.label}</option>
                    ))}
                </select>
            </div>

            <p className={css.section_label}>
                Select Steps to Run:
            </p>
            <div className={css.steps_container}>
                {stepDisplay()}
            </div>

            <div className={css.steps_actions_footer}>
                <TreeNavBar setShowConfig={setShowConfig} />

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
