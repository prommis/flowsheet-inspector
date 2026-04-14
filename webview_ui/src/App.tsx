import { useState, useEffect } from 'react';
import { vscode } from './vscode';
import { useContext } from 'react';
import { AppContext } from './context';

import TreePage from './tree_app.tsx'
import EditorPage from './editor_page';
import WebView from './web_view/main_display.tsx';
import './webviewApp.css'

export default function App() {
  const {
    setidaesRunInfo, // the idaes-run --info result
    setEditorContent, // the activate editor content
    setActivateFileName, // the current activate file name
    setFlowsheetRunnerResult, // the idaes-run result
    setExtensionConfig, // the extension config
    setExtensionErrorLogs, // the extension error logs
    setTerminalLogs,
    setIsLoading,
    setInitError
  } = useContext(AppContext);

  const [appName, setAppName] = useState('');
  const [isHighlight, setIsHighlight] = useState(false);

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
          break;
        case 'flowsheet_detail':
          // handle flowsheet data
          console.log(`VSCode post message: ${JSON.stringify(message)}`);
          break;
        case 'flowsheet_runner_result':
          console.log('receited flowsheet runner result, and update state');
          setFlowsheetRunnerResult(message.data);
          break;
        case 'readExtensionConfig':
          console.log(`VSCode post message to initialize extension config data: ${JSON.stringify(message)}`)
          setExtensionConfig(message.content);
          break;
        case 'updateExtensionConfig':
          console.log(`VSCode post message to update extension config data: ${JSON.stringify(message)}`)
          setExtensionConfig(message.content);
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
        case 'clear_terminal_logs':
          setTerminalLogs([]);
          break;
        case 'highlight_view':
          console.log('Highlighting view per VSCode instruction');
          setIsHighlight(false);
          // Small timeout to restart animation if triggered again
          setTimeout(() => setIsHighlight(true), 10);
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