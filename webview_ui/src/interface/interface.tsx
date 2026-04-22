import type { Dispatch, SetStateAction } from "react";
import type { FlowsheetRunnerResult } from "./flowsheet_result_interface";

export type FlowsheetSteps = Array<string>;
export type SetFlowsheetSteps = Dispatch<SetStateAction<FlowsheetSteps>>;
export type idaesRunInfo = { classname: string, steps: Array<string> };
export type SetidaesRunInfo = Dispatch<SetStateAction<idaesRunInfo>>;
export type IsRunningFlowsheet = boolean;
export type SetIsRunningFlowsheet = Dispatch<SetStateAction<IsRunningFlowsheet>>;
export type { FlowsheetRunnerResult };
export type SetFlowsheetRunnerResult = Dispatch<SetStateAction<FlowsheetRunnerResult | null>>;
export type EditorContent = string;
export type SetEditorContent = Dispatch<SetStateAction<EditorContent>>;
export type ActivateFileName = string;
export type SetActivateFileName = Dispatch<SetStateAction<ActivateFileName>>;
export type MermaidDiagram = string;
export type SetMermaidDiagram = Dispatch<SetStateAction<MermaidDiagram>>;
export type IExtensionConfig = {
    sorce_treminal: string;
    activate_command: string;
    output_file_name: string;
    shell: string;
}
export type ExtensionConfigState = IExtensionConfig | null;
export type SetExtensionConfig = Dispatch<SetStateAction<ExtensionConfigState>>;
export type ExtensionErrorLogsType = string[];
export type SetExtensionErrorLogs = Dispatch<SetStateAction<ExtensionErrorLogsType>>;

export type TerminalLogsType = string[];
export type SetTerminalLogs = Dispatch<SetStateAction<TerminalLogsType>>;

export type OpenPythonFile = { name: string, path: string };
export type OpenPythonFilesType = OpenPythonFile[];
export type SetOpenPythonFiles = Dispatch<SetStateAction<OpenPythonFilesType>>;

export type IdaesHistoryItem = {
    id: number;
    created: number;
    name: string;
    filename: string;
    status: boolean;
    solverError?: string;
};
