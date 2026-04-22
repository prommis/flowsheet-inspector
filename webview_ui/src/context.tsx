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
    type IExtensionConfig,
    type SetExtensionConfig,
    type SetExtensionErrorLogs,
    type ExtensionErrorLogsType,
    type TerminalLogsType,
    type SetTerminalLogs,
    type OpenPythonFilesType,
    type SetOpenPythonFiles
} from "./interface/interface";

export type ActiveLogTab = 'error' | 'terminal';
export type SetActiveLogTab = React.Dispatch<React.SetStateAction<ActiveLogTab>>;

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
    extensionConfig: IExtensionConfig | null;
    setExtensionConfig: SetExtensionConfig;
    extensionErrorLogs: ExtensionErrorLogsType;
    setExtensionErrorLogs: SetExtensionErrorLogs;
    terminalLogs: TerminalLogsType;
    setTerminalLogs: SetTerminalLogs;
    activeLogTab: ActiveLogTab;
    setActiveLogTab: SetActiveLogTab;
    initError: string | null;
    setInitError: React.Dispatch<React.SetStateAction<string | null>>;
    openPythonFiles: OpenPythonFilesType;
    setOpenPythonFiles: SetOpenPythonFiles;
    idaesHistoryList: any[] | null;
    setIdaesHistoryList: React.Dispatch<React.SetStateAction<any[] | null>>;
}
// Create context with default values
export const AppContext = createContext({} as AppContextType);

