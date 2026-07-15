import { useState, useEffect, useRef } from 'react';
import { vscode } from './vscode';
import { useContext } from 'react';
import { AppContext } from './context';
import type { Diagnostics } from './interface/flowsheet_result_interface';

import TreePage from './tree_app.tsx'
import EditorPage from './editor_page';
import WebView from './web_view/main_display.tsx';
import './webviewApp.css'

export default function App() {
  const {
    setidaesRunInfo, // the idaes-run --info result
    setEditorContent, // the activate editor content
    setActivateFileName, // the current activate file name
    flowsheetRunnerResult,
    setFlowsheetRunnerResult, // the idaes-run result
    setExtensionErrorLogs, // the extension error logs
    setTerminalLogs,
    setIsLoading,
    setInitError,
    setPackageWarnings,
    setOpenPythonFiles,
    setIdaesHistoryList,
    setMermaidDiagram,
    setOsPlatform,
    setStepStatuses,
    setCurrentPythonEnv
  } = useContext(AppContext);

  const [appName, setAppName] = useState('');
  const [isHighlight, setIsHighlight] = useState(false);
  // Step names already reported to the error log this run. step_status_update
  // is broadcast repeatedly while polling, so this prevents logging the same
  // failure line on every tick. Cleared at the start of each new run.
  const loggedStepFailuresRef = useRef<Set<string>>(new Set());

  // clear vscode error in console
  // console.clear();

  /**
   * This function controls which app to load based on the message from the extension
   * @param message 
   * @returns 
   */
  function loadWhichApp(pageName: string) {
    let loadedApp: React.ReactNode | undefined = undefined
    console.log(`Now loading page: ${pageName}`)
    switch (pageName) {
      case 'editor':
        loadedApp = <EditorPage />
        break;
      case 'webView':
        console.log('loading web view page');
        loadedApp = <WebView />
        break;
      case 'treeView':
        console.log('loading tree page');
        loadedApp = <TreePage />
        break;
      case 'error':
        console.log(`Encounter an error: ${pageName}`);
        break;
      default:
        console.log('Unknown message type:', pageName);
        break;
    }
    return loadedApp
  }

  // Log run-failure details once per result change, from this stable root component
  useEffect(() => {
    if (!flowsheetRunnerResult) return;
    const diagnostics = flowsheetRunnerResult.actions?.diagnostics as Diagnostics | undefined;
    if (diagnostics?.valid !== false) return;

    const lastRun = flowsheetRunnerResult.last_run ?? [];
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    setExtensionErrorLogs(prev => [
      ...prev,
      `${timestamp} fi-run has issues: diagnostics unavailable (valid=false). Last completed steps: [${lastRun.join(", ")}]. Raw data: ${JSON.stringify({ diagnostics, last_run: lastRun })}`,
      `${timestamp} fi-run has issues: model variables unavailable. Raw data: ${JSON.stringify({ model_variables: flowsheetRunnerResult.actions?.model_variables, last_run: lastRun })}`,
      `${timestamp} fi-run has issues: solver output may be incomplete. Raw data: ${JSON.stringify({ solver_output: flowsheetRunnerResult.actions?.solver_output, last_run: lastRun })}`,
      `${timestamp} fi-run has issues: mermaid diagram unavailable. Raw data: ${JSON.stringify({ mermaid_diagram: flowsheetRunnerResult.actions?.mermaid_diagram, last_run: lastRun })}`,
    ]);
  }, [flowsheetRunnerResult]);

  useEffect(() => {
    // listen extension message
    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          console.log(`VSCode post message: ${JSON.stringify(message)}`);
          setEditorContent(message.content);
          setActivateFileName(message.fileName);
          setidaesRunInfo(message.idaesRunInfo);
          setAppName(message.loadApp);
          setIsLoading(false);
          if (message.osPlatform) {
            setOsPlatform(message.osPlatform);
          }
          break;
        case 'update':
          console.log(`VSCode post message: ${JSON.stringify(message)}`);
          setEditorContent(message.content);
          break;
        case 'switch_tab':
          console.log('Received switch_tab event with payload:', message);
          if (message.isLoading !== undefined) {
            console.log('Calling setIsLoading with:', message.isLoading);
            setIsLoading(message.isLoading);
            setActivateFileName(message.activate_tab_name);
          } else {
            setActivateFileName(message.activate_tab_name);
          }
          if (message.idaesRunInfo !== undefined) {
            setidaesRunInfo(message.idaesRunInfo);
          }
          if (message.initError) {
            setInitError(message.initError);
          } else if (message.initError === null || message.isLoading) {
            setInitError(null);
          }
          if (message.isLoading) {
            setPackageWarnings(null);
          }
          else if (message.packageWarnings !== undefined) {
            setPackageWarnings(message.packageWarnings);
          }
          if (message.open_python_files !== undefined) {
            setOpenPythonFiles(message.open_python_files);
          }
          break;
        case 'python_env_update':
          console.log('Received python_env_update:', message);
          setCurrentPythonEnv(message.current ?? null);
          break;
        case 'update_open_files':
          console.log('Received update_open_files event');
          if (message.open_python_files !== undefined) {
            setOpenPythonFiles(message.open_python_files);
          }
          break;
        case 'flowsheet_detail':
          // handle flowsheet data
          console.log(`VSCode post message: ${JSON.stringify(message)}`);
          break;
        case 'flowsheet_runner_result':
          console.log('receited flowsheet runner result, and update state');
          setFlowsheetRunnerResult(message.data);
          break;
        case 'error':
          console.log(`VSCode post error message: ${JSON.stringify(message)}`);
          setExtensionErrorLogs((prev: string[]) => {
            const newError = `[${new Date().toLocaleTimeString()}] ${message.message || JSON.stringify(message)}`;
            return [...prev, newError];
          });
          break;
        case 'terminal_log':
          setTerminalLogs((prev: string[]) => [...prev, message.data]);
          break;
        case 'start_new_run':
          // Clear previous run results so stale diagram/IPOPT/diagnostic data doesn't linger during a new run
          setFlowsheetRunnerResult(null);
          setMermaidDiagram('');
          setExtensionErrorLogs([]);
          // Reset per-step run indicators so the tree view starts from a clean slate
          setStepStatuses({});
          loggedStepFailuresRef.current.clear();
          break;
        case 'step_status_update': {
          // Live per-step progress from the running fi-run process. Build a map
          // keyed by step name so the tree view can render running / success /
          // error icons next to each step.
          //
          // Two distinct failure kinds:
          //   - 'error'         — the step's code raised (errcode !== 0): red X
          //   - 'solver_failed' — a solve step ran without raising but found no
          //                       solution (solve_ok === 0: infeasible / max
          //                       iterations): orange X
          // solve_ok === null means a non-solve step or unknown status and is
          // never treated as a failure.
          // `reset` (sent when loading a historical run) starts from a clean
          // slate so the tree view and error log reflect only that run.
          if (message.reset) {
            loggedStepFailuresRef.current.clear();
          }
          const nextStatuses: Record<string, { state: 'success' | 'error' | 'solver_failed'; errmsg?: string }> = {};
          const newErrorLines: string[] = [];
          for (const row of message.data ?? []) {
            let state: 'success' | 'error' | 'solver_failed' = 'success';
            let errmsg: string | undefined = row.errmsg || undefined;
            if (row.errcode !== 0) {
              state = 'error';
            } else if (row.solve_ok === 0) {
              state = 'solver_failed';
              errmsg = errmsg || 'Solver did not find a solution (infeasible or maximum iterations exceeded)';
            }
            nextStatuses[row.step_name] = { state, errmsg };

            // Surface each failure in the error log once per run.
            if (state !== 'success' && !loggedStepFailuresRef.current.has(row.step_name)) {
              loggedStepFailuresRef.current.add(row.step_name);
              const reason = state === 'solver_failed'
                ? (errmsg || 'Solver did not find a solution')
                : (errmsg || 'Step raised an error');
              newErrorLines.push(`[${new Date().toLocaleTimeString()}] Step "${row.step_name}" failed: ${reason}`);
            }
          }
          setStepStatuses(nextStatuses);
          if (message.reset) {
            // Loading a historical run: the error log should show only this run.
            setExtensionErrorLogs(newErrorLines);
          } else if (newErrorLines.length > 0) {
            setExtensionErrorLogs((prev: string[]) => [...prev, ...newErrorLines]);
          }
          break;
        }
        case 'clear_terminal_logs':
          setTerminalLogs([]);
          break;
        case 'highlight_view':
          console.log('Highlighting view per VSCode instruction');
          setIsHighlight(false);
          // Small timeout to restart animation if triggered again
          setTimeout(() => setIsHighlight(true), 10);
          break;
        case 'history_update':
          console.log(`Received history list length: ${message.data?.length}`);
          setIdaesHistoryList(message.data);
          break;
        default:
          console.log('Unknown message type:', JSON.stringify(message));
          break;
      }
    });

    // tell extension React is ready, can send data
    vscode.postMessage({ frontendInstruction: 'ready', fromPanel: 'treeView' });
  }, []);

  return (
    <div
      className={isHighlight ? 'flash-highlight' : ''}
      onAnimationEnd={() => setIsHighlight(false)}
      style={{ height: '100vh', width: '100vw', boxSizing: 'border-box', backgroundColor: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)' }}
    >
      {loadWhichApp(appName)}
    </div>
  );
}