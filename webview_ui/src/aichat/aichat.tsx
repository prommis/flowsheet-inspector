import { useState, useRef } from "react";
import css from "../css/aichat.module.css";

// CBorg API config
const CBORG_API_URL = "https://api.cborg.lbl.gov/v1/chat/completions";
const CBORG_MODEL = "lbl/cborg-chat";

interface ChatMessage {
    from: "user" | "assistant";
    message: string;
}

export default function AiChat() {
    const [showChat, setShowChat] = useState(false);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
        { from: "assistant", message: "Hello, I can help you with code generation, optimization, and debugging. What would you like to work on?" },
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const chatDisplay = chatHistory.map((item, index) => {
        return (
            <div key={index} className={`${css.chat_item}`}>
                <p
                    className={`${item.from === "assistant" ? css.box_text : css.user_text} ${css.chat_text}`}
                >
                    {item.message}
                </p>
            </div>
        )
    })

    /**
     * Send user message to CBorg AI and update chat history with the response.
     */
    const handleSend = async () => {
        if (!inputRef.current || !inputRef.current.value.trim()) return;

        const userMessage = inputRef.current.value.trim();
        inputRef.current.value = "";

        // Add user message to chat history
        const updatedHistory: ChatMessage[] = [
            ...chatHistory,
            { from: "user", message: userMessage }
        ];
        setChatHistory(updatedHistory);

        // Call CBorg API
        setIsLoading(true);
        const aiResponse = await cborgAIHandler(updatedHistory);
        setIsLoading(false);

        setChatHistory(prev => [
            ...prev,
            { from: "assistant", message: aiResponse }
        ]);
    };

    return (
        <>
            <div className={`${css.aichatToggle}`} onClick={() => setShowChat(!showChat)}>
                <div className={`${css.aichatToggleText}`}>
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9.5 2l1.5 4.5L15.5 8l-4.5 1.5L9.5 14l-1.5-4.5L3.5 8l4.5-1.5L9.5 2z" />
                            <path d="M18 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
                        </svg>
                    </span>
                    AI Assistant
                </div>
                <div className={`${css.aichatToggleIcon}`}>
                    {showChat ? (
                        /* mini - */
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 12H19" />
                        </svg>
                    ) : (
                        /* arrow down */
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 9L12 15L18 9" />
                        </svg>
                    )}
                </div>
            </div>
            <div className={`${css.aichat_container}`} style={{ display: showChat ? 'flex' : 'none' }}>
                <h2>AI Chat <span></span></h2>
                <div className={`${css.chatbox}`}>
                    {chatDisplay}
                    {isLoading && (
                        <div className={`${css.chat_item}`}>
                            <p className={`${css.box_text} ${css.chat_text}`}>Thinking...</p>
                        </div>
                    )}
                </div>
                <div className={`${css.input_container}`}>
                    <input
                        ref={inputRef}
                        type="text"
                        className={`${css.chat_input}`}
                        placeholder="Ask AI..."
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                    />
                    <button className={`${css.chat_send_btn}`} onClick={handleSend}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13" />
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                        </svg>
                    </button>
                </div>
            </div>
        </>
    );
}


/**
 * Call CBorg AI API (OpenAI-compatible) and return the assistant's response.
 * 
 * API Key should be set as environment variable CBORG_API_KEY.
 * In VS Code extension, you can pass it via settings or globalState.
 * 
 * @param chatHistory - current chat history to provide context
 * @returns the AI assistant's response text
 */
async function cborgAIHandler(chatHistory: ChatMessage[]): Promise<string> {
    try {
        // Convert chat history to OpenAI message format
        const messages = chatHistory.map(item => ({
            role: item.from === "user" ? "user" : "assistant",
            content: item.message
        }));

        // Add system prompt
        messages.unshift({
            role: "system",
            content: "You are an IDAES expert assistant. Help users with IDAES flowsheet modeling, optimization, and debugging. Keep responses concise."
        });

        const response = await fetch(CBORG_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getCborgApiKey()}`
            },
            body: JSON.stringify({
                model: CBORG_MODEL,
                messages: messages,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`CBorg API error: ${response.status} ${errorText}`);
            return `Error: API returned ${response.status}. Please check your API key.`;
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "No response from AI.";

    } catch (error) {
        console.error("CBorg AI error:", error);
        return `Error: Failed to connect to CBorg API. ${error}`;
    }
}

/**
 * Get CBorg API key. 
 * TODO: Replace with a proper way to retrieve the key 
 * (e.g., from VS Code extension settings via postMessage, or from user input).
 */
function getCborgApiKey(): string {
    // Option 1: Hardcode for testing (NOT recommended for production)
    // return "your-api-key-here";

    // Option 2: Read from a meta tag or global variable set by the extension
    // const metaTag = document.querySelector('meta[name="cborg-api-key"]');
    // if (metaTag) {
    //     return metaTag.getAttribute("content") || "";
    // }

    const cborgKey = import.meta.env.VITE_CBORG_KEY || "";
    console.log(cborgKey)
    return cborgKey;
}