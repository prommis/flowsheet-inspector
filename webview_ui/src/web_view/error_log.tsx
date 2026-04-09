import { useContext } from 'react';
import { AppContext } from '../context';
import css from "../css/logview.module.css";

export default function ErrorLog() {
    const { extensionErrorLogs, setExtensionErrorLogs } = useContext(AppContext);

    const handleClearLogs = () => {
        setExtensionErrorLogs([]);
    };

    return (
        <div className={css.content_section}>
            <div className={css.logs_header}>
                <h2 className={css.logs_title}>Extension Logs & Errors</h2>
                <button
                    className={css.clear_logs_button}
                    onClick={handleClearLogs}
                    title="Clear all logs"
                >
                    Clear Logs
                </button>
            </div>

            <div className={css.logs_container}>
                {extensionErrorLogs.length === 0 ? (
                    <span className={css.no_logs}>No errors logged.</span>
                ) : (
                    extensionErrorLogs.map((log, index) => (
                        <div key={index} className={css.log_item}>
                            {log}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}