import { useState } from "react";
import { vscode } from "./vscode";
import css from "./css/tree_app.module.css";
import RunFlowsheetView from "./treeview/run_flowsheet_view";
import LoadFlowsheetView from "./treeview/load_flowsheet_view";
import FeedbackUi from "./treeview/feedback_ui";

// import AiChat from "./aichat/aichat"; // tempary close the AI chat

export default function TreePage() {
    const [view, setView] = useState("runFlowsheet");
    // When true the whole tree app main area is replaced by the feedback
    // panel; closing it returns to the steps (runFlowsheet) main panel.
    const [showFeedback, setShowFeedback] = useState(false);

    const switchViewHandler = (viewName: string) => {
        setView(viewName);
    };

    /**
     * Closes the feedback panel and lands the user back on the steps
     * (Run Flowsheet) main panel.
     */
    const closeFeedbackHandler = () => {
        setShowFeedback(false);
        setView("runFlowsheet");
    };

    /**
     * Asks the extension host to open this extension's details page (the
     * same page the Marketplace / Extensions view shows), which renders the
     * bundled README.md as the documentation.
     */
    const openDocumentation = () => {
        vscode.postMessage({ frontendInstruction: "open_documentation", fromPanel: "treeView" });
    };

    /**
     * Builds a keyboard fallback for a footer row so it stays reachable
     * without a pointer: Enter or Space triggers the row's action.
     *
     * @param action - Handler to run when Enter or Space is pressed.
     * @returns A keydown handler to attach to the footer row.
     */
    const footerRowKeyDown = (action: () => void) => (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            action();
        }
    };

    if (showFeedback) {
        return (
            <div className={`${css.tree_app_container}`}>
                <FeedbackUi onClose={closeFeedbackHandler} />
            </div>
        );
    }

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
                    History
                </li>
            </ul>
            {view === "runFlowsheet" && <RunFlowsheetView />}
            {view === "loadFlowsheet" && <LoadFlowsheetView />}

            <div className={css.tree_footer}>
                <div
                    className={css.footer_row}
                    role="button"
                    tabIndex={0}
                    onClick={openDocumentation}
                    onKeyDown={footerRowKeyDown(openDocumentation)}
                >
                    <span className={css.footer_row_label}>Documentation</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 2.5h6.5L13 6v7.5H3V2.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M9.5 2.5V6H13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M5.5 8.5h5M5.5 10.75h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                </div>
                <div
                    className={`${css.footer_row} ${css.feedback_footer_row}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowFeedback(true)}
                    onKeyDown={footerRowKeyDown(() => setShowFeedback(true))}
                >
                    <span className={css.footer_row_label}>Raise an issue / Give feedback</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2.5 2.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3 3v-3H2.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M8 4.8v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <circle cx="8" cy="9.7" r="0.8" fill="currentColor"/>
                    </svg>
                </div>
            </div>
        </div>
    );
}
