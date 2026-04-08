export interface IExtensionConfig {
    activate_command: string;
    sorce_treminal: string;
    output_file_name: string;
    shell: string;
}

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