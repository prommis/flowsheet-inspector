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
export type ExtensionErrorLogsType = string[];
export type SetExtensionErrorLogs = Dispatch<SetStateAction<ExtensionErrorLogsType>>;

export type TerminalLogsType = string[];
export type SetTerminalLogs = Dispatch<SetStateAction<TerminalLogsType>>;

export type OpenPythonFile = { name: string, path: string };
export type OpenPythonFilesType = OpenPythonFile[];
export type SetOpenPythonFiles = Dispatch<SetStateAction<OpenPythonFilesType>>;

export type CurrentPythonEnv = { path: string; name: string } | null;
export type SetCurrentPythonEnv = Dispatch<SetStateAction<CurrentPythonEnv>>;

export type IPackageWarning = { name: string; install_command: string };

export type IdaesHistoryItem = {
    id: number;
    created: number;
    name: string;
    filename: string;
    status: boolean;
    solverError?: string;
    tags?: string;
};

/**
 * Live status of a single completed flowsheet step, keyed by step name.
 * `success` when the step finished with errcode 0, `error` otherwise.
 * A step that has not produced a row yet is simply absent from the map.
 */
export type StepRunState = 'success' | 'error';
export type StepStatusMap = Record<string, { state: StepRunState; errmsg?: string }>;
export type SetStepStatusMap = Dispatch<SetStateAction<StepStatusMap>>;
