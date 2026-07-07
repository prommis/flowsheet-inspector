import { useContext, useEffect } from "react";
import { AppContext } from "../context";
import FlowsheetSteps from "./flowsheet_steps";

export default function RunFlowsheetView() {
    const { idaesRunInfo, setIsRunningFlowsheet } = useContext(AppContext);

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
        <FlowsheetSteps idaesRunInfo={idaesRunInfo} />
    )
}