import { useContext, useState } from "react";
import { AppContext } from "../context";
import css from "../css/ipopt.module.css";
import type { Diagnostics } from "../interface/flowsheet_result_interface";

/** Strip the Ipopt banner (everything up to and including the 2nd **** line) */
function stripIpoptBanner(text: string | null | undefined): string {
    if (!text) {
        return "No solver output available for this step.";
    }

    const lines = text.split('\n');
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
    return text; // No banner found, return as-is
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
                    <pre className={`${css.solver_output}`}>
                        {stripIpoptBanner(solverLogs.solve_initial)}
                    </pre>
                )}
                {activeTab === 'optimization' && (
                    <pre className={`${css.solver_output}`}>
                        {stripIpoptBanner(solverLogs.solve_optimization)}
                    </pre>
                )}
            </div>
        </div>
    );
}