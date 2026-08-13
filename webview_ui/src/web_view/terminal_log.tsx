import { useContext, useEffect, useRef } from 'react';
import { AppContext } from '../context';
import LogLevelCheckbox from '../components/log_level_checkbox';
import { isLogLineVisible } from '../util/log_level_filter';
import css from "../css/logview.module.css";

export default function TerminalLogs() {
    const { terminalLogs, setTerminalLogs, logLevelFilters } = useContext(AppContext);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [terminalLogs.length]);

    const handleClearLogs = () => {
        setTerminalLogs([]);
    };

    // Each terminalLogs entry is a raw stdout/stderr chunk that may span
    // multiple lines, so filtering has to happen per line: keep only the
    // lines whose level matches the current checkbox selection, and drop
    // chunks that end up empty. Hidden lines stay in terminalLogs untouched.
    const visibleLogs = terminalLogs
        .map(chunk => chunk
            .split('\n')
            .filter(line => isLogLineVisible(line, logLevelFilters))
            .join('\n'))
        .filter(chunk => chunk.trim() !== '');

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

            <LogLevelCheckbox />

            <div className={css.logs_container}>
                {terminalLogs.length === 0 ? (
                    <span className={css.no_logs}>No terminal output.</span>
                ) : visibleLogs.length === 0 ? (
                    <span className={css.no_logs}>No logs match the selected levels.</span>
                ) : (
                    visibleLogs.map((log, index) => (
                        <div key={index} className={css.terminal_log_line}>
                            {log}
                        </div>
                    ))
                )}
                <div ref={endRef} />
            </div>
        </div>
    );
}
