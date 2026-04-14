import { useContext } from "react";
import { AppContext } from "../context";
import css from "../css/ipopt.module.css";

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

    const solverLogs = flowsheetRunnerResult?.actions?.capture_solver_output?.solver_logs;

    if (!solverLogs) {
        return (
            <div className={`${css.ipopt_container}`}>
                <h1>IPOPT</h1>
                <p>Please select a flowsheet, and run it with IDAES Extension first.</p>
            </div>
        );
    }

    return (
        <div className={`${css.ipopt_container}`}>
            <h1>IPOPT</h1>
            <h2 className={`${css.solver_output_title}`}>Initial Solver Output:</h2>
            <pre className={`${css.solver_output}`}>{stripIpoptBanner(solverLogs.solve_initial)}</pre>
            <h2 className={`${css.solver_output_title}`}>Optimization Solver Output:</h2>
            <pre className={`${css.solver_output}`}>{stripIpoptBanner(solverLogs.solve_optimization)}</pre>
        </div>
    );
}