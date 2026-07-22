import { useContext, useMemo, useState } from "react";
import { AppContext } from "../context";
import css from "../css/ipopt.module.css";
import type { Diagnostics } from "../interface/flowsheet_result_interface";

/** Strip the Ipopt banner (everything up to and including the 2nd **** line) */
function stripIpoptBanner(text: string | null | undefined): string {
    if (!text) {
        return "No solver output available for this step.";
    }

    // fi-run captures raw terminal output, which can contain backspace
    // control characters (e.g. from solver progress rendering); drop them so
    // they never show up as artifacts in the webview.
    const cleaned = text.replace(/\u0008/g, '');
    const lines = cleaned.split('\n');
    let starCount = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('*****')) {
            starCount++;
            if (starCount === 2) {
                // Return everything after this line, trimming leading blank lines
                return lines.slice(i + 1).join('\n').trimStart();
            }
        }
    }
    return cleaned; // No banner found, return as-is
}

/**
 * The three logical sections of one IPOPT solver log, in original print order:
 * problem statistics → iteration table → result summary.
 */
interface IIpoptSections {
    /** Problem statistics printed before the iteration table (Ipopt version, nonzeros, variable/constraint counts). */
    statistics: string;
    /** The iteration table: repeated `iter objective ...` headers plus one row per iteration. */
    iterations: string;
    /** Number of iteration rows found in `iterations`, used for the toggle button label. */
    iterationCount: number;
    /** Final result summary, from the `Number of Iterations....:` line to the end (EXIT line removed). */
    result: string;
    /** The `EXIT: ...` conclusion line, shown as a headline above everything; '' if absent. */
    exitLine: string;
}

/**
 * Splits a banner-stripped IPOPT log into statistics / iterations / result
 * sections, so the result summary can be rendered first and the iteration
 * table — often thousands of lines long — can be collapsed (issue #34).
 *
 * Section boundaries are located via IPOPT's own text markers: the first
 * `iter  objective ...` table header starts the iteration section, and the
 * `Number of Iterations....:` line starts the result summary.
 *
 * @param text  Banner-stripped solver output for one solve.
 * @returns The parsed sections, or null when the result marker is missing
 *   (e.g. the solver crashed before printing a summary) — the caller then
 *   falls back to rendering the raw text unchanged.
 */
function splitIpoptOutput(text: string): IIpoptSections | null {
    const lines = text.split('\n');
    const resultStart = lines.findIndex((l) => /^Number of Iterations\s*\.*\s*:/.test(l.trim()));
    if (resultStart === -1) {
        return null;
    }
    let iterStart = lines.findIndex((l) => /^iter\s+objective/.test(l.trim()));
    if (iterStart === -1 || iterStart > resultStart) {
        // No iteration table (e.g. solved in 0 iterations): keep everything
        // before the summary in the statistics section.
        iterStart = resultStart;
    }
    const iterationLines = lines.slice(iterStart, resultStart);
    // Iteration rows start with the iteration number, optionally suffixed with
    // `r` (restoration phase), e.g. `  12 ...` or `2995r-9.17e+07 ...`.
    const iterationCount = iterationLines.filter((l) => /^\s*\d+r?(\s|-)/.test(l)).length;

    // Pull the `EXIT: ...` conclusion out of the summary — it is the single
    // most important line of the whole log, so it is shown as a headline
    // above the summary instead of buried at its end.
    const resultLines = lines.slice(resultStart);
    const exitIdx = resultLines.findIndex((l) => l.trim().startsWith('EXIT:'));
    const exitLine = exitIdx === -1 ? '' : resultLines[exitIdx].trim();
    if (exitIdx !== -1) {
        resultLines.splice(exitIdx, 1);
    }

    return {
        statistics: lines.slice(0, iterStart).join('\n').trim(),
        iterations: iterationLines.join('\n').trim(),
        iterationCount,
        result: resultLines.join('\n').trim(),
        exitLine,
    };
}

/**
 * Renders one solver log re-ordered for readability (issue #34): the final
 * result summary on top, then a collapsible problem-statistics block
 * (expanded by default), then the collapsible iteration table (collapsed by
 * default because it can run to thousands of lines).
 *
 * Falls back to the raw log when the IPOPT section markers cannot be found.
 *
 * @param props.text  Raw solver output for one solve (banner included).
 */
function SolverOutput({ text }: { text: string | null | undefined }) {
    const stripped = stripIpoptBanner(text);
    const sections = useMemo(() => splitIpoptOutput(stripped), [stripped]);
    const [showStatistics, setShowStatistics] = useState(true);
    const [showIterations, setShowIterations] = useState(false);

    if (!sections) {
        return <pre className={css.solver_output}>{stripped}</pre>;
    }

    return (
        <div className={css.solver_sections}>
            {sections.exitLine && (
                <p className={css.exit_headline}>{sections.exitLine}</p>
            )}
            <pre className={`${css.solver_output} ${css.section_body}`}>{sections.result}</pre>

            {sections.statistics && (
                <>
                    <button className={css.section_toggle} onClick={() => setShowStatistics(v => !v)}>
                        <span className={`${css.toggle_chevron} ${showStatistics ? css.toggle_chevron_open : ''}`} />
                        {showStatistics ? 'Hide problem statistics' : 'Show problem statistics'}
                    </button>
                    {showStatistics && (
                        <pre className={`${css.solver_output} ${css.section_body}`}>{sections.statistics}</pre>
                    )}
                </>
            )}

            {sections.iterations && (
                <>
                    <button className={css.section_toggle} onClick={() => setShowIterations(v => !v)}>
                        <span className={`${css.toggle_chevron} ${showIterations ? css.toggle_chevron_open : ''}`} />
                        {showIterations
                            ? `Hide iterations (${sections.iterationCount})`
                            : `Show iterations (${sections.iterationCount})`}
                    </button>
                    {showIterations && (
                        <pre className={`${css.solver_output} ${css.iterations_body}`}>{sections.iterations}</pre>
                    )}
                </>
            )}
        </div>
    );
}

export default function Ipopt() {
    const { flowsheetRunnerResult } = useContext(AppContext);
    const [activeTab, setActiveTab] = useState<"initial" | "optimization">("initial");
    const diagnostics = flowsheetRunnerResult?.actions?.diagnostics as Diagnostics | undefined;
    const runFailed = !!flowsheetRunnerResult && diagnostics?.valid === false;

    const solverLogs = flowsheetRunnerResult?.actions?.solver_output?.output
        || flowsheetRunnerResult?.actions?.capture_solver_output?.solver_logs;

    if (!flowsheetRunnerResult) {
        return (
            <div className={`${css.ipopt_container}`}>
                <h2 className="page-title">IPOPT:</h2>
                <p>Please select a flowsheet, and run it with IDAES Extension first.</p>
            </div>
        );
    }

    if (runFailed) {
        const lastRun = flowsheetRunnerResult.last_run ?? [];
        return (
            <div className={css.ipopt_container}>
                <h2 className="page-title">IPOPT:</h2>
                <div className={css.run_error}>
                    <p className={css.run_error_title}>
                        fi-run has issues: Solver Output Unavailable
                    </p>
                    <p className={css.run_error_body}>
                        The flowsheet run may have failed or did not reach the solve step.
                        {lastRun.length > 0 && ` Last completed steps: ${lastRun.join(" → ")}.`}
                    </p>
                    <p className={css.run_error_hint}>Check the error log for details.</p>
                </div>
            </div>
        );
    }

    if (!solverLogs) {
        return (
            <div className={`${css.ipopt_container}`}>
                <h2 className="page-title">IPOPT:</h2>
                <p>Please select a flowsheet, and run it with IDAES Extension first.</p>
            </div>
        );
    }

    return (
        <div className={`${css.ipopt_container}`}>
            <h2 className="page-title">IPOPT</h2>

            <div className={css.tabs}>
                <span
                    className={`${css.tab} ${activeTab === 'initial' ? css.tab_active : ''}`}
                    onClick={() => setActiveTab('initial')}
                >
                    Initial Solver Output
                </span>
                <span
                    className={`${css.tab} ${activeTab === 'optimization' ? css.tab_active : ''}`}
                    onClick={() => setActiveTab('optimization')}
                >
                    Optimization Solver Output
                </span>
            </div>

            <div className={css.tab_content}>
                {activeTab === 'initial' && (
                    <SolverOutput text={solverLogs.solve_initial} />
                )}
                {activeTab === 'optimization' && (
                    <SolverOutput text={solverLogs.solve_optimization} />
                )}
            </div>
        </div>
    );
}