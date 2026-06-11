export interface IFrontendMessage {
    frontendInstruction: string;
    fromPanel: string;
    [key: string]: any;
}

export interface IFlowsheetRunResult {
    actions: {
        mermaid_diagram: { diagram: string[] };
        [key: string]: any;
    };
    [key: string]: any;
}