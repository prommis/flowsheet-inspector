import { useContext } from "react";
import { AppContext } from "../context";
import RenderVariableTree from "../util/flowsheet_result_variable_to_html";

export default function FlowsheetVariableDisplay() {
    const { flowsheetRunnerResult } = useContext(AppContext);
    if (
        !flowsheetRunnerResult ||
        !flowsheetRunnerResult.actions?.model_variables?.variables
    ) {
        return <p>No flowsheet variable data available</p>;
    }

    const variables = flowsheetRunnerResult.actions.model_variables.variables;
    const dofSteps = flowsheetRunnerResult.actions?.degrees_of_freedom?.steps;

    return (
        <section>
            <h2>Flowsheet Parameters & Variables:</h2>
            <RenderVariableTree data={variables} dofSteps={dofSteps} />
        </section>
    );
}