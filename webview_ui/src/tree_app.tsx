import { useState } from "react";
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
     * Keyboard fallback for the footer feedback row so it stays reachable
     * without a pointer: Enter or Space opens the feedback panel.
     *
     * @param event - React keydown event on the footer row.
     */
    const handleFeedbackRowKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setShowFeedback(true);
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

            <div
                className={css.feedback_footer_row}
                role="button"
                tabIndex={0}
                onClick={() => setShowFeedback(true)}
                onKeyDown={handleFeedbackRowKeyDown}
            >
                <span className={css.feedback_footer_label}>Raise an issue / Give feedback</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.5 2.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3 3v-3H2.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    <path d="M8 4.8v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <circle cx="8" cy="9.7" r="0.8" fill="currentColor"/>
                </svg>
            </div>
        </div>
    );
}
