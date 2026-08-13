import { createContext } from "react";
import {
    type FlowsheetSteps,
    type SetFlowsheetSteps,
    type idaesRunInfo,
    type SetidaesRunInfo,
    type IsRunningFlowsheet,
    type SetIsRunningFlowsheet,
    type FlowsheetRunnerResult,
    type SetFlowsheetRunnerResult,
    type EditorContent,
    type SetEditorContent,
    type ActivateFileName,
    type SetActivateFileName,
    type MermaidDiagram,
    type SetMermaidDiagram,
    type SetExtensionErrorLogs,
    type ExtensionErrorLogsType,
    type TerminalLogsType,
    type SetTerminalLogs,
    type OpenPythonFilesType,
    type SetOpenPythonFiles,
    type IdaesHistoryItem,
    type StepStatusMap,
    type SetStepStatusMap,
    type CurrentPythonEnv,
    type SetCurrentPythonEnv,
    type IPackageWarning
} from "./interface/interface";

export type ActiveLogTab = 'error' | 'terminal';
export type SetActiveLogTab = React.Dispatch<React.SetStateAction<ActiveLogTab>>;

/**
 * Which log severity levels are currently visible in the terminal log panel.
 * Each flag hides (not deletes) the matching log lines when false. When every
 * flag is true the panel shows all lines, including ones with no level tag.
 */
export interface LogLevelFilters {
    info: boolean;
    warning: boolean;
    error: boolean;
}
export type SetLogLevelFilters = React.Dispatch<React.SetStateAction<LogLevelFilters>>;

interface AppContextType {
    isLoading: boolean;
    setIsLoading: (isLoading: boolean) => void;
    selectedSteps: FlowsheetSteps;
    setSelectedSteps: SetFlowsheetSteps;
    idaesRunInfo: idaesRunInfo;
    setidaesRunInfo: SetidaesRunInfo;
    isRunningFlowsheet: IsRunningFlowsheet;
    setIsRunningFlowsheet: SetIsRunningFlowsheet;
    flowsheetRunnerResult: FlowsheetRunnerResult | null;
    setFlowsheetRunnerResult: SetFlowsheetRunnerResult;
    editorContent: EditorContent;
    setEditorContent: SetEditorContent;
    activateFileName: ActivateFileName;
    setActivateFileName: SetActivateFileName;
    mermaidDiagram: MermaidDiagram;
    setMermaidDiagram: SetMermaidDiagram;
    extensionErrorLogs: ExtensionErrorLogsType;
    setExtensionErrorLogs: SetExtensionErrorLogs;
    terminalLogs: TerminalLogsType;
    setTerminalLogs: SetTerminalLogs;
    activeLogTab: ActiveLogTab;
    setActiveLogTab: SetActiveLogTab;
    logLevelFilters: LogLevelFilters;
    setLogLevelFilters: SetLogLevelFilters;
    initError: string | null;
    setInitError: React.Dispatch<React.SetStateAction<string | null>>;
    packageWarnings: IPackageWarning[] | null;
    setPackageWarnings: React.Dispatch<React.SetStateAction<IPackageWarning[] | null>>;
    openPythonFiles: OpenPythonFilesType;
    setOpenPythonFiles: SetOpenPythonFiles;
    idaesHistoryList: IdaesHistoryItem[] | null;
    setIdaesHistoryList: React.Dispatch<React.SetStateAction<IdaesHistoryItem[] | null>>;
    osPlatform: string;
    setOsPlatform: React.Dispatch<React.SetStateAction<string>>;
    stepStatuses: StepStatusMap;
    setStepStatuses: SetStepStatusMap;
    currentPythonEnv: CurrentPythonEnv;
    setCurrentPythonEnv: SetCurrentPythonEnv;
}
// Create context with default values
export const AppContext = createContext({} as AppContextType);

