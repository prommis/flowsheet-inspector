import { useState, useContext, useEffect, useRef } from "react";
import { AppContext } from "../context";
import Mermaid from "./meraid";
import Ipopt from "./ipopt";
import Diagnostic from "./diagnostic";
import Variable from "../variable_view/flowsheet_variable_display";
import LogsView from "./logs";
import css from "../css/webview_maindisplay.module.css";
export default function WebView() {
    const [activeTab, setActiveTab] = useState('diagram');
    const { extensionErrorLogs, setActiveLogTab } = useContext(AppContext);
    const [flashLogs, setFlashLogs] = useState(false);
    const prevLogsLength = useRef(extensionErrorLogs.length);
    const { flowsheetRunnerResult } = useContext(AppContext);
    
    // total model dof
    const totalDof = flowsheetRunnerResult?.actions?.degrees_of_freedom?.model;

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'switch_sub_tab' && message.tab_name) {
                setActiveTab(message.tab_name);
                if (message.sub_tab_name === 'error' || message.sub_tab_name === 'terminal') {
                    setActiveLogTab(message.sub_tab_name);
                }
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        if (extensionErrorLogs.length > prevLogsLength.current) {
            setTimeout(() => {
                setFlashLogs(false);
                setTimeout(() => setFlashLogs(true), 50);
            }, 0);
        }
        prevLogsLength.current = extensionErrorLogs.length;
    }, [extensionErrorLogs.length]);

    let display = <></>;
    switch (activeTab) {
        case 'diagram':
            display = <Mermaid />;
            break;
        case 'variable':
            display = <Variable />;
            break;
        case 'ipopt':
            display = <Ipopt />;
            break;
        case 'diagnostics':
            display = <Diagnostic />;
            break;
        case 'logs':
            display = <LogsView />;
            break;
        default:
            display = <div>Unknown tab: {activeTab}</div>
    }

    function changeActivateTabHandler(tabName: string) {
        setActiveTab(tabName);
    }
    return (
        <div className={`${css.main_display_container}`}>
            <ul className={`${css.nav}`}>
                <li
                    className={`${css.nav_item} ${activeTab === 'diagram' ? css.nav_item_active : ''}`}
                    onClick={() => changeActivateTabHandler('diagram')}>
                    DIAGRAM
                </li>
                <li
                    className={`${css.nav_item} ${activeTab === 'variable' ? css.nav_item_active : ''}`}
                    onClick={() => changeActivateTabHandler('variable')}>
                    FLOWSHEET VARIABLES {totalDof !== undefined && <span style={{ textTransform: 'none', fontStyle: 'italic', marginLeft: '4px' }}>Dof({totalDof})</span>}
                </li>
                <li
                    className={`${css.nav_item} ${activeTab === 'diagnostics' ? css.nav_item_active : ''}`}
                    onClick={() => changeActivateTabHandler('diagnostics')}>
                    DIAGNOSTICS
                </li>
                <li
                    className={`${css.nav_item} ${activeTab === 'ipopt' ? css.nav_item_active : ''}`}
                    onClick={() => changeActivateTabHandler('ipopt')}>
                    IPOPT <span className={`${css.blue_dot}`}></span>
                </li>
                <li
                    className={`${css.nav_item} ${activeTab === 'logs' ? css.nav_item_active : ''} ${flashLogs ? 'flash-red-highlight' : ''}`}
                    onClick={() => {
                        changeActivateTabHandler('logs');
                        setFlashLogs(false);
                    }}>
                    LOGS {flashLogs && <span className={`${css.blue_dot}`}></span>}
                </li>
            </ul>
            {display}
        </div>
    );
}