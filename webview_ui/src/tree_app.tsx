import FlowsheetSteps from "./treeview/flowsheet_steps";
import { AppContext } from "./context";
import { useContext, useState, useEffect } from "react";
import ConfigView from "./treeview/configView";
// import AiChat from "./aichat/aichat"; // tempary close the AI chat
import css from "./css/tree_app.module.css";
export default function TreePage() {
    const { idaesRunInfo, activateFileName, setIsRunningFlowsheet } = useContext(AppContext);
    const [showConfig, setShowConfig] = useState(false);

    useEffect(() => {
        window.addEventListener('message', (e) => {
            const message = e.data;
            console.log(e.data)
            switch (message.type) {
                case 'run_flowsheet_done':
                    setIsRunningFlowsheet(false);
                    break;
                default:
                    console.log(`Unknown message from extension: ${message}`);
            }
        })
    }, [])
    return (
        <div className={`${css.tree_app_container}`}>
            <h2>Current Files is: {activateFileName}</h2>
            {/* <AiChat /> */}
            <div style={{ display: showConfig ? "block" : "none" }}>
                <ConfigView setShowConfig={setShowConfig} />
            </div>
            <div style={{ display: showConfig ? "none" : "block" }}>
                <FlowsheetSteps idaesRunInfo={idaesRunInfo} setShowConfig={setShowConfig} />
            </div>
        </div>
    );
}