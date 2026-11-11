import { useEffect, useState, useContext, useRef } from "react";
import type { idaesRunInfo } from "../interface/interface";
import { AppContext } from "../context";
import { vscode } from '../vscode';
import TreeNavBar from "./treeviewNav";
import css from "../css/tree_app.module.css";

/**
 * Encapsulates the structure of idaesRunInfo.steps, mapping flowsheet variables
 * to their associated lists of step names. Provides methods to manage the active
 * flowsheet variable and retrieve its steps.
 */
class FlowsheetStepsMap {
    private stepsMap: Record<string, string[]>;
    private activeFlowsheet: string | null;

    constructor(stepsMap: Record<string, string[]> = {}) {
        this.stepsMap = stepsMap;
        this.activeFlowsheet = Object.keys(stepsMap)[0] || null;
    }

    /**
     * Gets the current active flowsheet variable.
     * @returns The name of the active flowsheet variable, or null if none is set.
     */
    getActiveFlowsheet(): string | null {
        return this.activeFlowsheet;
    }

    /**
     * Sets the active flowsheet variable.
     * @param flowsheetName - The name of the flowsheet variable to activate.
     * @throws Error if the flowsheet variable does not exist in the steps map.
     */
    setActiveFlowsheet(flowsheetName: string): void {
        if (!this.stepsMap.hasOwnProperty(flowsheetName)) {
            throw new Error(`Flowsheet variable '${flowsheetName}' not found in steps map`);
        }
        this.activeFlowsheet = flowsheetName;
    }

    /**
     * Gets the list of steps associated with the active flowsheet variable.
     * @returns An array of step names, or an empty array if no flowsheet is active.
     */
    getActiveSteps(): string[] {
        if (!this.activeFlowsheet) {
            return [];
        }
        return this.stepsMap[this.activeFlowsheet] || [];
    }

    /**
     * Gets all available flowsheet variables.
     * @returns An array of flowsheet variable names.
     */
    getAllFlowsheets(): string[] {
        return Object.keys(this.stepsMap);
    }

    /**
     * Gets the steps for a specific flowsheet variable.
     * @param flowsheetName - The name of the flowsheet variable.
     * @returns An array of step names, or null if the flowsheet does not exist.
     */
    getStepsForFlowsheet(flowsheetName: string): string[] | null {
        if (!this.stepsMap.hasOwnProperty(flowsheetName)) {
            return null;
        }
        return this.stepsMap[flowsheetName];
    }

    /**
     * Updates the entire steps map.
     * @param newStepsMap - The new steps map to replace the current one.
     */
    updateStepsMap(newStepsMap: Record<string, string[]>): void {
        this.stepsMap = newStepsMap;
        // Reset active flowsheet if it no longer exists
        if (this.activeFlowsheet && !this.stepsMap.hasOwnProperty(this.activeFlowsheet)) {
            this.activeFlowsheet = Object.keys(this.stepsMap)[0] || null;
        }
    }

    getKey(): string {
        return this.getActiveSteps().join('@');
    }
}

export default function FlowsheetSteps({ idaesRunInfo }: { idaesRunInfo: idaesRunInfo }) {
    const { setSelectedSteps, isLoading, initError, packageWarnings, openPythonFiles, activateFileName, currentPythonEnv, stepStatuses, isRunningFlowsheet } = useContext(AppContext);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [activeFlowsheet, setActiveFlowsheet] = useState<string | null>(null);

    console.log("idaesRunInfo", idaesRunInfo);
    const stepsMap = useRef(new FlowsheetStepsMap(idaesRunInfo?.steps || {}));
    console.log("stepsMap", stepsMap.current);

    // DOM refs to each timeline row, used to map a pointer's clientY to a step
    // index while dragging along the rail.
    const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
    // Live drag session info. `moved` flips to true once the pointer leaves the
    // row it started on, which is how we tell a drag from a plain click.
    const dragState = useRef<{ startIndex: number; moved: boolean } | null>(null);
    // Mirror of selectedIndices.length readable from window-level pointer
    // handlers without suffering from stale closures.
    const selectedCountRef = useRef(0);
    // The pointer listeners currently attached to window, kept in a ref so the
    // exact same instances can be detached on drag end or unmount.
    const activeDragListeners = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);

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

    const handleSelectFlowsheet = (flowsheetName: string) => {
        try {
            stepsMap.current.setActiveFlowsheet(flowsheetName);
            console.log("Changed active flowsheet to:", stepsMap.current.getActiveFlowsheet());
            // Update the selected steps to the active flowsheet's steps
            const activeSteps = stepsMap.current.getActiveSteps();
            setSelectedSteps(activeSteps);
        } catch (error) {
            console.error('Error selecting flowsheet:', error);
        }
    };


    /**
     * Selects the first `count` steps (indices 0..count-1) and writes both the
     * indices (local state, drives the timeline visuals) and the corresponding
     * step names (context, consumed by the run command).
     *
     * Steps always run as a contiguous prefix of the sequence, so the selection
     * is fully described by how many steps are selected.
     *
     * @param count - Number of leading steps to select; 0 clears the selection.
     */
    const applyPrefixSelection = (count: number) => {
        const newSteps = Array.from({ length: count }, (_, i) => i);
        setSelectedIndices(newSteps);
        // Write selected step NAMES to context
        const activeSteps = stepsMap.current.getActiveSteps();
        const stepNames = newSteps.map(i => activeSteps[i]).filter(Boolean);
        setSelectedSteps(stepNames);
    };

    /**
     * Applies plain-click semantics for a step dot/row: clicking any step
     * selects it plus every step before it. Clicking the step that is already
     * the end of the selection deselects just that step (shrinking the prefix
     * by one), mirroring the old checkbox toggle behavior.
     *
     * @param index - Index of the clicked step row.
     */
    const handleStepClick = (index: number) => {
        const lastSelected = selectedCountRef.current - 1;
        applyPrefixSelection(index === lastSelected ? index : index + 1);
    };

    /**
     * Maps a pointer's vertical position to the step row it is over. Positions
     * above the first row clamp to the first step and below the last row clamp
     * to the last step, so dragging past either end stays well-behaved.
     *
     * @param clientY - Pointer Y coordinate in viewport space.
     * @returns The step index under (or nearest to) the pointer, or null when
     *   no rows are rendered yet.
     */
    const indexFromClientY = (clientY: number): number | null => {
        const rows = rowRefs.current;
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i]?.getBoundingClientRect();
            if (rect && clientY >= rect.top && clientY <= rect.bottom) {
                return i;
            }
        }
        const firstRect = rows[0]?.getBoundingClientRect();
        if (firstRect && clientY < firstRect.top) {
            return 0;
        }
        const lastRect = rows[rows.length - 1]?.getBoundingClientRect();
        if (lastRect && clientY > lastRect.bottom) {
            return rows.length - 1;
        }
        return null;
    };

    /**
     * Window-level pointermove handler active only during a drag along the
     * timeline. Once the pointer moves onto a different row than the one the
     * drag started on, the selection prefix live-updates to follow the pointer.
     *
     * @param event - Native pointermove event.
     */
    const handleDragMove = (event: PointerEvent) => {
        const drag = dragState.current;
        if (!drag) {
            return;
        }
        const index = indexFromClientY(event.clientY);
        if (index === null) {
            return;
        }
        if (index !== drag.startIndex) {
            drag.moved = true;
        }
        if (drag.moved) {
            applyPrefixSelection(index + 1);
        }
    };

    /**
     * Window-level pointerup handler that ends a timeline drag session. If the
     * pointer never left the starting row, the gesture was a click and the
     * click toggle semantics are applied instead of the drag semantics.
     *
     * @param event - Native pointerup event.
     */
    const handleDragEnd = (event: PointerEvent) => {
        const drag = dragState.current;
        dragState.current = null;
        detachDragListeners();
        if (drag && !drag.moved) {
            const index = indexFromClientY(event.clientY);
            handleStepClick(index ?? drag.startIndex);
        }
    };

    /**
     * Removes the window-level drag listeners recorded in
     * `activeDragListeners`, if any are currently attached.
     */
    const detachDragListeners = () => {
        const listeners = activeDragListeners.current;
        if (listeners) {
            window.removeEventListener('pointermove', listeners.move);
            window.removeEventListener('pointerup', listeners.up);
            activeDragListeners.current = null;
        }
    };

    /**
     * Keyboard fallback for the pointer-driven timeline: Enter or Space on a
     * focused step row applies the same semantics as clicking its dot.
     *
     * @param event - React keydown event on the row.
     * @param index - Index of the focused step row.
     */
    const handleRowKeyDown = (event: React.KeyboardEvent, index: number) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleStepClick(index);
        }
    };

    /**
     * Starts a drag/click gesture on a step row. Registers window-level
     * listeners so the drag keeps tracking even when the pointer leaves the
     * sidebar, and defers the click-vs-drag decision to pointerup.
     *
     * @param event - React pointerdown event on the row.
     * @param index - Index of the row the gesture started on.
     */
    const handleRowPointerDown = (event: React.PointerEvent, index: number) => {
        // Only react to the primary button / touch contact.
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        detachDragListeners();
        dragState.current = { startIndex: index, moved: false };
        activeDragListeners.current = { move: handleDragMove, up: handleDragEnd };
        window.addEventListener('pointermove', handleDragMove);
        window.addEventListener('pointerup', handleDragEnd);
    };

    // Keep the ref mirror of the selection size in sync after each commit so
    // window-level pointer handlers always read the latest value.
    useEffect(() => {
        selectedCountRef.current = selectedIndices.length;
    }, [selectedIndices]);

    // Update stepsMap when idaesRunInfo changes
    useEffect(() => {
        if (idaesRunInfo?.steps) {
            stepsMap.current.updateStepsMap(idaesRunInfo.steps);
            // Set initial active flowsheet if not already set
            if (!activeFlowsheet) {
                const firstFlowsheet = stepsMap.current.getAllFlowsheets()[0];
                if (firstFlowsheet) {
                    stepsMap.current.setActiveFlowsheet(firstFlowsheet);
                    setActiveFlowsheet(firstFlowsheet);
                }
            }
        }
    }, [idaesRunInfo?.steps]);

    // Content fingerprint of the step list. Extension messages recreate the
    // steps array on every post, so comparing joined names (rather than array
    // identity) ensures the default-selection effect below only fires when the
    // steps actually change, not on every re-broadcast.
    const stepsKey = stepsMap.current.getKey();
    
    // Default to selecting every step whenever a new step list arrives
    // (initial load or switching to another flowsheet). An empty selection is
    // treated by the runner as "run all steps", so the UI must show all steps
    // selected to match what an untouched Run button actually does.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot sync of selection state to a new step list pushed from the extension host
        applyPrefixSelection(stepsMap.current.getActiveSteps().length ?? 0);
    }, [stepsKey]);

    // Make sure no window listeners leak if the component unmounts mid-drag.
    useEffect(() => {
        return () => detachDragListeners();
    }, []);

    // generate flowsheet steps
    const steps_title = "Steps Display";
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
                    <h2>{steps_title}</h2>
                    <p>Config data loaded successfully, but no steps in config data</p>
                </div>
            )
        }

        // has config data and steps but steps is empty
        if (configDataSteps.includes("steps") && configDataSteps.length === 0) {
            return (
                <div>
                    <h2>{steps_title}</h2>
                    <p>Config data loaded successfully, has steps but steps is empty</p>
                </div>
            )
        }

        // build step displays
        const stepsList = stepsMap.current.getActiveSteps();
        // The currently-running step is the first one (in sequence) that has
        // no recorded status yet, provided a run is in progress and no earlier
        // step has failed. Steps run as a contiguous prefix, so this is the
        // step being executed right now.
        const firstPendingIndex = stepsList.findIndex(s => !stepStatuses[s]);
        const anyFailed = stepsList.some(s => {
            const st = stepStatuses[s]?.state;
            return st === 'error' || st === 'solver_failed';
        });
        const runningIndex = isRunningFlowsheet && !anyFailed ? firstPendingIndex : -1;

        // The selection is always a contiguous prefix, so the highest
        // selected index fully describes it. It marks the "thumb" dot and
        // where the blue portion of the rail ends.
        const lastSelectedIndex = selectedIndices.length - 1;
        const lastRowIndex = stepsList.length - 1;

        const stepDisplays = stepsList.map((step: string, index: number) => {
            const isSelected = index <= lastSelectedIndex;
            const rowClasses = [
                css.step_row,
                isSelected ? css.step_row_selected : '',
                index === 0 && isSelected ? css.step_row_selected_first : '',
                index === lastSelectedIndex ? css.step_row_selected_last : '',
            ].filter(Boolean).join(' ');

            return (
                <div key={step + index}
                    ref={(el) => { rowRefs.current[index] = el; }}
                    className={rowClasses}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onPointerDown={(e) => handleRowPointerDown(e, index)}
                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                >
                    <span className={css.step_rail}>
                        {index > 0 && (
                            <span className={`${css.rail_segment} ${css.rail_segment_top} ${isSelected ? css.rail_segment_active : ''}`} />
                        )}
                        {index < lastRowIndex && (
                            <span className={`${css.rail_segment} ${css.rail_segment_bottom} ${index < lastSelectedIndex ? css.rail_segment_active : ''}`} />
                        )}
                        <span className={`${css.step_dot} ${isSelected ? css.step_dot_selected : ''} ${index === lastSelectedIndex ? css.step_dot_thumb : ''}`} />
                    </span>
                    <span className={css.step_label}>{step}</span>
                    {renderStepIcon(step, index === runningIndex)}
                </div>
            )
        })
        return <div className={css.steps_timeline}>{stepDisplays}</div>;
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

            <div className={css.flowsheet_selection_section}>
                <label className={css.section_label}>
                    Select Flowsheet Variable:
                </label>
                <select
                    className={css.dropdown_select}
                    onChange={(e) => handleSelectFlowsheet(e.target.value)}
                    value={stepsMap.current.getActiveFlowsheet() || ""}
                >
                    <option value="" disabled>Select a flowsheet variable...</option>
                    {stepsMap.current.getAllFlowsheets().map((flowsheet) => (
                        <option key={flowsheet} value={flowsheet}>{flowsheet}</option>
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
