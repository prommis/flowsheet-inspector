import { AppContext, type ActiveLogTab } from "./context";
import { type ReactNode, useState } from "react";
import {
    type FlowsheetSteps,
    type idaesRunInfo,
    type FlowsheetRunnerResult,
    type EditorContent,
    type ActivateFileName,
    type IExtensionConfig,
    type ExtensionErrorLogsType,
    type TerminalLogsType,
    type OpenPythonFilesType,
    type MermaidDiagram
} from "./interface/interface";


export function AppProvider({ children }: { children: ReactNode }) {
    const [isLoading, setIsLoading] = useState(true);
    const [idaesRunInfo, setidaesRunInfo] = useState<idaesRunInfo>({
        classname: "",
        steps: []
    });
    const [selectedSteps, setSelectedSteps] = useState<FlowsheetSteps>([]);
    const [isRunningFlowsheet, setIsRunningFlowsheet] = useState(false);
    const [flowsheetRunnerResult, setFlowsheetRunnerResult] = useState<FlowsheetRunnerResult | null>(null);
    const [editorContent, setEditorContent] = useState<EditorContent>("");
    const [activateFileName, setActivateFileName] = useState<ActivateFileName>("");
    const [mermaidDiagram, setMermaidDiagram] = useState<MermaidDiagram>('');
    const [extensionConfig, setExtensionConfig] = useState<IExtensionConfig | null>(null);
    const [extensionErrorLogs, setExtensionErrorLogs] = useState<ExtensionErrorLogsType>([]);
    const [terminalLogs, setTerminalLogs] = useState<TerminalLogsType>([]);
    const [activeLogTab, setActiveLogTab] = useState<ActiveLogTab>('error');
    const [initError, setInitError] = useState<string | null>(null);
    const [openPythonFiles, setOpenPythonFiles] = useState<OpenPythonFilesType>([]);

    return (
        <AppContext.Provider value={{
            isLoading,
            setIsLoading,
            selectedSteps,
            setSelectedSteps,
            idaesRunInfo,
            setidaesRunInfo,
            isRunningFlowsheet,
            setIsRunningFlowsheet,
            flowsheetRunnerResult,
            setFlowsheetRunnerResult,
            editorContent,
            setEditorContent,
            activateFileName,
            setActivateFileName,
            mermaidDiagram,
            setMermaidDiagram,
            extensionConfig,
            setExtensionConfig,
            extensionErrorLogs,
            setExtensionErrorLogs,
            terminalLogs,
            setTerminalLogs,
            activeLogTab,
            setActiveLogTab,
            initError,
            setInitError,
            openPythonFiles,
            setOpenPythonFiles
        }}>
            {children}
        </AppContext.Provider>
    );
}