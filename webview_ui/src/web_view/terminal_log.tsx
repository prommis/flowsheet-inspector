import { useContext, useEffect, useRef } from 'react';
import { AppContext } from '../context';
import css from "../css/logview.module.css";

export default function TerminalLogs() {
    const { terminalLogs, setTerminalLogs } = useContext(AppContext);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [terminalLogs.length]);

    const handleClearLogs = () => {
        setTerminalLogs([]);
    };

    return (
        <div className={css.content_section}>
            <div className={css.logs_header}>
                <h2 className={css.logs_title}>Terminal Output</h2>
                <button
                    className={css.clear_logs_button}
                    onClick={handleClearLogs}
                    title="Clear terminal logs"
                >
                    Clear Logs
                </button>
            </div>

            <div className={css.logs_container}>
                {terminalLogs.length === 0 ? (
                    <span className={css.no_logs}>No terminal output.</span>
                ) : (
                    terminalLogs.map((log, index) => (
                        <div key={index} style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--vscode-editor-font-family, monospace)', marginBottom: '2px', wordBreak: 'break-all' }}>
                            {log}
                        </div>
                    ))
                )}
                <div ref={endRef} />
            </div>
        </div>
    );
}