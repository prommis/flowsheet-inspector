import { useState } from "react";
import css from "./css/tree_app.module.css";
import RunFlowsheetView from "./treeview/run_flowsheet_view";
import LoadFlowsheetView from "./treeview/load_flowsheet_view";

// import AiChat from "./aichat/aichat"; // tempary close the AI chat

export default function TreePage() {
    const [view, setView] = useState("runFlowsheet");

    const switchViewHandler = (viewName: string) => {
        setView(viewName);
    };


    return (
        <div className={`${css.tree_app_container}`}>
            <ul className={css.view_switch_container}>
                <li 
                    className={view === "runFlowsheet" ? css.active : ""} 
                    onClick={() => switchViewHandler("runFlowsheet")}
                >
                    Run Flowsheet
                </li>
                <li 
                    className={view === "loadFlowsheet" ? css.active : ""} 
                    onClick={() => switchViewHandler("loadFlowsheet")}
                >
                    Load Flowsheet
                </li>
            </ul>
            {view === "runFlowsheet" && <RunFlowsheetView />}
            {view === "loadFlowsheet" && <LoadFlowsheetView />}
        </div>
    );
}