import { useContext } from "react";
import { AppContext } from "../context";
import RenderVariableTree from "../util/flowsheet_result_variable_to_html";
import type { Diagnostics } from "../interface/flowsheet_result_interface";
import css from "../css/webview_page.module.css";

export default function FlowsheetVariableDisplay() {
    const { flowsheetRunnerResult } = useContext(AppContext);
    const diagnostics = flowsheetRunnerResult?.actions?.diagnostics as Diagnostics | undefined;
    const variables = flowsheetRunnerResult?.actions?.model_variables?.variables;
    const runFailed = !!flowsheetRunnerResult && diagnostics?.valid === false;

    if (!flowsheetRunnerResult) {
        return <p>No flowsheet variable data available</p>;
    }

    if (runFailed) {
        const lastRun = flowsheetRunnerResult.last_run ?? [];
        return (
            <div className={css.run_error}>
                <p className={css.run_error_title}>
                    fi-run has issues: Variable Data Unavailable
                </p>
                <p className={css.run_error_body}>
                    The flowsheet run may have failed or did not reach the solve step.
                    {lastRun.length > 0 && ` Last completed steps: ${lastRun.join(" → ")}.`}
                </p>
                <p className={css.run_error_hint}>Check the error log for details.</p>
            </div>
        );
    }

    if (!variables || Object.keys(variables).length === 0) {
        return <p>No flowsheet variable data available</p>;
    }

    const dofSteps = flowsheetRunnerResult.actions?.degrees_of_freedom?.steps;

    return (
        <section>
            <h2 className="page-title">Flowsheet Parameters & Variables:</h2>
            <RenderVariableTree data={variables} dofSteps={dofSteps} />
        </section>
    );
}
