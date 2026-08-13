import { useContext } from 'react';
import { AppContext } from '../context';
import type { LogLevelFilters } from '../context';
import css from '../css/logview.module.css';

/**
 * Row of checkboxes that filters the terminal log panel by severity.
 *
 * Renders "Show all logs" plus one checkbox per level (Info, Warning, Error).
 * The filter state lives in AppContext (logLevelFilters), so this component
 * only toggles flags — the log panel reads the same context to hide lines.
 * "Show all logs" is derived state: it is checked exactly when all three
 * levels are checked, checking it turns every level on, and unchecking it
 * turns every level off.
 *
 * @returns the checkbox row element
 */
export default function LogLevelCheckbox() {
    const { logLevelFilters, setLogLevelFilters } = useContext(AppContext);
    const showAll = logLevelFilters.info && logLevelFilters.warning && logLevelFilters.error;

    /**
     * Toggle a single level checkbox, leaving the other levels untouched.
     * The "Show all logs" checkbox follows automatically since it is derived
     * from the three level flags.
     *
     * @param level - which level flag to flip
     */
    const toggleLevel = (level: keyof LogLevelFilters) => {
        setLogLevelFilters(prev => ({ ...prev, [level]: !prev[level] }));
    };

    /**
     * Toggle the "Show all logs" checkbox: checking it selects every level,
     * unchecking it clears every level.
     */
    const toggleShowAll = () => {
        const next = !showAll;
        setLogLevelFilters({ info: next, warning: next, error: next });
    };

    return (
        <div className={css.log_level_filter_row}>
            <label className={css.log_level_filter_item}>
                <input
                    type="checkbox"
                    checked={showAll}
                    onChange={toggleShowAll}
                />
                Show all logs
            </label>
            <label className={css.log_level_filter_item}>
                <input
                    type="checkbox"
                    checked={logLevelFilters.info}
                    onChange={() => toggleLevel('info')}
                />
                Info
            </label>
            <label className={css.log_level_filter_item}>
                <input
                    type="checkbox"
                    checked={logLevelFilters.warning}
                    onChange={() => toggleLevel('warning')}
                />
                Warning
            </label>
            <label className={css.log_level_filter_item}>
                <input
                    type="checkbox"
                    checked={logLevelFilters.error}
                    onChange={() => toggleLevel('error')}
                />
                Error
            </label>
        </div>
    );
}
