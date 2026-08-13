import type { LogLevelFilters } from '../context';

/**
 * Classify a single log line into a severity level so the terminal log panel
 * can decide whether to display it under the current filter selection.
 *
 * Matches the uppercase level tokens emitted by Python/IDAES loggers (e.g.
 * "[INFO]", "WARNING:", "ERROR ...") as well as the extension's own
 * "[SYSTEM ERROR]" messages. Lines with no recognizable token return null.
 *
 * @param line - one line of terminal output
 * @returns the detected level, or null when the line carries no level tag
 */
export function classifyLogLine(line: string): keyof LogLevelFilters | null {
    if (/\b(ERROR|CRITICAL)\b/.test(line)) return 'error';
    if (/\b(WARNING|WARN)\b/.test(line)) return 'warning';
    if (/\bINFO\b/.test(line)) return 'info';
    return null;
}

/**
 * Decide whether a log line should be visible under the given filters.
 *
 * Lines with a detected level are shown only when that level's checkbox is
 * on. Lines without any level tag (plain stdout, tracebacks, solver output)
 * are shown only in "Show all logs" mode, i.e. when every level is selected —
 * otherwise a partial filter would be flooded by untagged output.
 *
 * @param line - one line of terminal output
 * @param filters - the current level filter selection from context
 * @returns true when the line should be rendered
 */
export function isLogLineVisible(line: string, filters: LogLevelFilters): boolean {
    const level = classifyLogLine(line);
    if (level === null) {
        return filters.info && filters.warning && filters.error;
    }
    return filters[level];
}
