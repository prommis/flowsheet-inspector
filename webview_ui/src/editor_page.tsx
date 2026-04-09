import { useState, useContext } from 'react';
import { AppContext } from './context';


export default function EditorPage() {

    const [isExpanded, setIsExpanded] = useState(false);
    const { editorContent, activateFileName } = useContext(AppContext);

    const toggleHandler = () => {
        setIsExpanded(!isExpanded);
    }

    return (
        <div>
            <button onClick={() => toggleHandler()}>
                Toggle Editor Content
            </button>

            <div style={{ display: isExpanded ? 'block' : 'none' }}>
                <h1>Editor Page </h1>
                <h2>File: {activateFileName}</h2>
                <pre>{editorContent}</pre>
            </div>
        </div>
    );
}