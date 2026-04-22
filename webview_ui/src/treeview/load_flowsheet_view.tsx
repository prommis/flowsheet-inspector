import { useState, useContext, useEffect, useMemo } from "react";
import css from "../css/load_flowsheet_view.module.css";
import { AppContext } from "../context";
import { vscode } from "../vscode";

// Helper to convert unix timestamp to relative time string
function timeSince(unixTimestampSeconds: number) {
    if (!unixTimestampSeconds) return "-";
    const date = new Date(unixTimestampSeconds * 1000);
    const seconds = Math.floor(Date.now() / 1000 - unixTimestampSeconds);
    
    let interval = seconds / 86400;
    if (interval > 1) {
        // Greater than 1 day, show the actual date and time
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: false
        });
    }
    interval = seconds / 3600;
    if (interval >= 1) {
        const h = Math.floor(interval);
        const m = Math.floor((seconds - h * 3600) / 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    interval = seconds / 60;
    if (interval >= 1) {
        return Math.floor(interval) + "m";
    }
    return Math.floor(seconds) + "s";
}

export default function LoadFlowsheetView() {
    const { idaesHistoryList } = useContext(AppContext);
    
    // Automatically extract unique names
    const uniqueNames = useMemo(() => {
        if (!idaesHistoryList) return [];
        const names = idaesHistoryList.map(r => r.name || r.filename).filter(Boolean);
        return Array.from(new Set(names));
    }, [idaesHistoryList]);

    const [selectedName, setSelectedName] = useState<string>("");

    useEffect(() => {
        if (!selectedName && uniqueNames.length > 0) {
            setSelectedName(uniqueNames[0]);
        }
    }, [uniqueNames, selectedName]);

    const filteredRuns = useMemo(() => {
        if (!idaesHistoryList || !selectedName) return [];
        return idaesHistoryList.filter(r => (r.name || r.filename) === selectedName);
    }, [idaesHistoryList, selectedName]);

    const handleLoadRun = (id?: number) => {
        if (id) {
            vscode.postMessage({ frontendInstruction: "pull_flowsheet_history", fromPanel: "treeView", id });
        } else if (selectedName) {
            vscode.postMessage({ frontendInstruction: "pull_flowsheet_history", fromPanel: "treeView", name: selectedName });
        }
    };

    return (
        <div className={css.container}>
            {/* Control Bar */}
            <div className={css.controlBar}>
                <select 
                    name="selectFlowsheet" 
                    className={css.selectBox} 
                    value={selectedName}
                    onChange={(e) => setSelectedName(e.target.value)}
                    disabled={idaesHistoryList === null || uniqueNames.length === 0}
                >
                    {idaesHistoryList === null && (
                        <option value="" disabled>Loading IDAES history...</option>
                    )}
                    {idaesHistoryList !== null && uniqueNames.length === 0 && (
                        <option value="" disabled>No history found</option>
                    )}
                    {uniqueNames.map((name, index) => (
                        <option key={index} value={name}>{name}</option>
                    ))}
                </select>

                <div className={css.actionGroup}>
                    <span className={css.runCount}>Runs: {filteredRuns.length}</span>
                    <button 
                        className={css.primaryButton} 
                        onClick={() => handleLoadRun()}
                        disabled={!selectedName}
                    >
                        Show latest
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div className={css.tableContainer}>
                <div className={css.headerRow}>
                    <div className={css.colStatus}></div>
                    <div className={css.colTime}>Since</div>
                    <div className={css.colTags}>Tags</div>
                </div>

                <div className={css.dataRowContainer}>
                    {filteredRuns.map((run) => (
                        <div 
                            key={run.id} 
                            className={css.dataRow} 
                            onClick={() => handleLoadRun(run.id)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className={css.colStatus}>
                                {run.status ? (
                                    <div className={`${css["status-icon"]} ${css["status-icon--success"]}`}>✓</div>
                                ) : (
                                    <div className={`${css["status-icon"]} ${css["status-icon--fail"]}`}
                                         onClick={(e) => e.stopPropagation()} /* Prevent clicking from re-opening the run if they just wanted to inspect the error */
                                    >
                                        ✕
                                        <span className={css.cssTooltip}>
                                            {run.solverError ? `Solver Output: ${run.solverError}` : "Run failed. No solver output available."}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className={css.colTime}>{timeSince(run.created)}</div>
                            <div className={css.colTags}>
                                <span className={css.tagBadge}>-</span>
                            </div>
                        </div>
                    ))}
                    {idaesHistoryList === null && (
                        <div className={css.emptyMessage}>Scanning SQLite database...</div>
                    )}
                    {idaesHistoryList !== null && filteredRuns.length === 0 && (
                        <div className={css.emptyMessage}>
                            <div>No historical runs found across any flowsheet.</div>
                            <div style={{ marginTop: '8px', fontSize: '11px' }}>
                                Please execute a <b>RUN FLOWSHEET</b> above to generate history.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}