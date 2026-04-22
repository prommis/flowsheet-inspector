import { useContext, useState, useEffect } from "react";
import { AppContext } from "../context";
import ConfigView from "./configView";
import FlowsheetSteps from "./flowsheet_steps";

export default function RunFlowsheetView() {
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
        <>
            <h2>Current Files is: {activateFileName}</h2>
            {/* <AiChat /> */}
            <div style={{ display: showConfig ? "block" : "none" }}>
                <ConfigView setShowConfig={setShowConfig} />
            </div>
            <div style={{ display: showConfig ? "none" : "block" }}>
                <FlowsheetSteps idaesRunInfo={idaesRunInfo} setShowConfig={setShowConfig} />
            </div>
        </>
    )
}