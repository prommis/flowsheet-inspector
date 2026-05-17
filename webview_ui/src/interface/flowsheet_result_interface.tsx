// Variable value entry: [index, value, fixed?, stale?, lb?, ub?]
// index can be null, string, number, or string[] (for multi-indexed like ["Liq","benzene"])
// Short form: [index, value]  or  Full form: [index, value, fixed, stale, lb, ub]
export type VariableValueEntry =
    | [unknown, number]
    | [unknown, number, boolean, boolean, number | null, number | null];

// A single variable: [type, indexed, values]
// type: "V" = Variable, "P" = Parameter
export type VariableData = [string, boolean, VariableValueEntry[]];

// Recursive structure: each key maps to either a VariableData or a nested node
export interface VariableNode {
    [key: string]: VariableData | VariableNode;
}

// Degrees of freedom
export interface DOFSteps {
    [stepName: string]: {
        [componentPath: string]: number;
    };
}

export interface DegreesOfFreedom {
    steps: DOFSteps;
    model: number;
}

// Timings
export interface FlowsheetTimings {
    timings: {
        [stepName: string]: number;
    };
}

// Solver logs
export interface SolverOutput {
    output?: {
        [stepName: string]: string;
    };
    solver_logs?: {
        [stepName: string]: string;
    };
}

// Model variables
export interface ModelVariables {
    variables: VariableNode;
}

// Actions collected from the flowsheet run
export interface FlowsheetActions {
    degrees_of_freedom?: DegreesOfFreedom;
    timings?: FlowsheetTimings;
    capture_solver_output?: SolverOutput;
    solver_output?: SolverOutput;
    model_variables?: ModelVariables;
    mermaid_diagram?: { diagram: string[] | string };
    diagnostics?: Diagnostics;
}

// ─── Diagnostics Types ───

/** A single diagnostic check result (used in variables, constraints, and numerical_issues) */
export interface DiagnosticComponent {
    tag: string;
    description: string;
    names: string[];
    values: (number | null)[];
    value_format: string;
    /** Threshold/tolerance values. Keys vary by check type: tol, small, large, zero, abs, rel */
    bounds: Record<string, number>;
    /** Description of what bounds represent, e.g. "value range", "zero value", "near bounds" */
    bounds_desc: string | null;
    details: string[];
    empty: boolean;
}

export interface DiagnosticComponentList {
    components: DiagnosticComponent[];
}

export interface DiagnosticStructuralIssues {
    warnings: {
        dof: number;
        inconsistent_units: string | null;
        underconstrained_set: { variables: string[]; constraints: string[] } | null;
        overconstrained_set: { variables: string[]; constraints: string[] } | null;
        evaluation_errors: string[] | null;
    };
    cautions: {
        zero_vars: string[] | null;
        unused_vars_free: string[] | null;
        unused_vars_fixed: string[] | null;
    };
}

export interface DiagnosticNumericalIssues {
    warnings: {
        constraints_with_large_residuals: DiagnosticComponent | null;
        constraints_with_extreme_jacobians: DiagnosticComponent | null;
        constraints_parallel: DiagnosticComponentList | null;
        variables_parallel: DiagnosticComponentList | null;
    };
}

export interface Diagnostics {
    valid: boolean;
    variables: DiagnosticComponentList;
    constraints: DiagnosticComponentList;
    structural_issues: DiagnosticStructuralIssues;
    numerical_issues: DiagnosticNumericalIssues;
}

// Top-level runner result
export interface FlowsheetRunnerResult {
    actions: FlowsheetActions;
    last_run: string[];
    status: number;
}