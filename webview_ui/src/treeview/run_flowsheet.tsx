import { vscode } from "../vscode";
import { useContext, useEffect, useState } from "react";
import { AppContext } from "../context";
import css from "../css/run_flowsheet.module.css";
export default function RunFlowsheet(
    { setShowConfig }: { setShowConfig: React.Dispatch<React.SetStateAction<boolean>> }
) {
    const {
        isLoading,
        isRunningFlowsheet,
        setIsRunningFlowsheet,
        setFlowsheetRunnerResult,
        selectedSteps,
        setExtensionErrorLogs,
        setTerminalLogs
    } = useContext(AppContext);

    const [elapsedTime, setElapsedTime] = useState(0);
    const [dots, setDots] = useState(".");
    const [activePid, setActivePid] = useState<number | null>(null);

    /**
     * Handler for running the flowsheet by sending a "run_flowsheet" message to the extension backend, the backend should start run flowsheet, and record a process id to use for killing the process.
     * Also this will set isRunningFlowsheet to true, this will start the loading animation.   
     */
    const runFlowsheetHandler = () => {
        if (isLoading) return;
        const lastSelectedStep = selectedSteps.length > 0
            ? selectedSteps[selectedSteps.length - 1]
            : "";
        vscode.postMessage(
            {
                frontendInstruction: "run_flowsheet",
                fromPanel: 'treeView',
                selectedSteps: lastSelectedStep
            }
        );
        setElapsedTime(0);
        setDots(".");
        setExtensionErrorLogs([]); // Clear logs on new run
        setTerminalLogs([]); // Clear terminal on new run
        setIsRunningFlowsheet(true);
    }

    const cancelFlowsheetRunHandler = () => {
        console.log(`cancelFlowsheetRunHandler triggered, activePid is: ${activePid}`);
        vscode.postMessage(
            {
                frontendInstruction: 'kill_process',
                fromPanel: 'treeView',
                pid: activePid || 999999
            }
        );
        setIsRunningFlowsheet(false);
        setElapsedTime(0);
        setDots(".");
        setActivePid(null);
    }

    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'process_started':
                    console.log(`Received process_started message in frontend! PID is: ${message.pid}`);
                    if (message.pid) {
                        setActivePid(message.pid);
                    }
                    break;
                case 'flowsheet_detail':
                    setFlowsheetRunnerResult(message.data);
                    setIsRunningFlowsheet(false);
                    setElapsedTime(0);
                    setDots(".");
                    setActivePid(null);
                    break;
            }
        };
        window.addEventListener('message', messageHandler);
        return () => window.removeEventListener('message', messageHandler);
    }, [setFlowsheetRunnerResult, setIsRunningFlowsheet]);

    // Timer and animated dots logic
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (isRunningFlowsheet) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);
                setDots(prev => {
                    if (prev === ".") return "..";
                    if (prev === "..") return "...";
                    return ".";
                });
            }, 1000);
        }
        return () => {
            if (interval !== undefined) clearInterval(interval);
        };
    }, [isRunningFlowsheet]);

    const formatTime = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <section className={`${css.run_flowsheet_section}`}>
            <div className={`${css.run_flowsheet_button_container}`}>
                <button
                    className={`${css.run_flowsheet_button} ${isRunningFlowsheet ? css.cancel_flowsheet_run_btn_hidden : ''}`}
                    onClick={() => runFlowsheetHandler()}
                    disabled={isLoading}
                    style={{ opacity: isLoading ? 0.5 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                >
                    Run
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M6 5L11 8L6 11V5Z" fill="currentColor" />
                    </svg>
                </button>
                <button
                    onClick={() => cancelFlowsheetRunHandler()}
                    className={`
                        ${isRunningFlowsheet ? css.cancel_flowsheet_run_btn : css.cancel_flowsheet_run_btn_hidden}
                    `}
                >
                    Cancel
                </button>
                <span
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', marginLeft: '5px' }}
                    onClick={() => setShowConfig((prev: boolean) => !prev)}
                    title="Configuration"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" clipRule="evenodd" d="M6.69 1L6.29 3.06C5.88 3.19 5.5 3.38 5.15 3.62L3.14 2.88L1.83 5.12L3.45 6.65C3.42 6.87 3.4 7.09 3.4 7.31C3.4 7.53 3.42 7.75 3.45 7.97L1.83 9.5L3.14 11.74L5.15 11C5.5 11.24 5.88 11.43 6.29 11.56L6.69 13.62H9.31L9.71 11.56C10.12 11.43 10.5 11.24 10.85 11L12.86 11.74L14.17 9.5L12.55 7.97C12.58 7.75 12.6 7.53 12.6 7.31C12.6 7.09 12.58 6.87 12.55 6.65L14.17 5.12L12.86 2.88L10.85 3.62C10.5 3.38 10.12 3.19 9.71 3.06L9.31 1H6.69ZM8 9.31C9.1 9.31 10 8.41 10 7.31C10 6.21 9.1 5.31 8 5.31C6.9 5.31 6 6.21 6 7.31C6 8.41 6.9 9.31 8 9.31Z" />
                    </svg>
                </span>
            </div>

            <div className={`${css.run_flowsheet_animation_container}`}>
                <div className={`
                    ${isRunningFlowsheet ? css.running_time_container : css.running_timer_container_hidden}
                `}>
                    <p className={`${css.running_time_label}`}>Running<span className={`${css.running_dots}`}>{dots}</span></p>
                    <p className={`${css.running_time}`}>{formatTime(elapsedTime)}</p>
                </div>
            </div>
        </section>
    );
}