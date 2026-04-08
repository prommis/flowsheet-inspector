import { useEffect, useContext, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AppContext } from "../context";
import { vscode } from "../vscode";
import type { IExtensionConfig } from "../interface/interface";
import css from "../css/config.module.css";

export default function ConfigView({ setShowConfig }: { setShowConfig: Dispatch<SetStateAction<boolean>> }) {
    const { extensionConfig, setExtensionConfig } = useContext(AppContext);
    const activateCommandRef = useRef<HTMLInputElement>(null);
    const sorceTerminalRef = useRef<HTMLInputElement>(null);
    const outputFileNameRef = useRef<HTMLInputElement>(null);
    const shellRef = useRef<HTMLInputElement>(null);

    if (extensionConfig) {
        console.log(`get extension config: ${JSON.stringify(extensionConfig)}`)
    }

    function updateConfigHandler() {
        const updateConfig: IExtensionConfig = {
            activate_command: activateCommandRef.current?.value || "",
            sorce_treminal: sorceTerminalRef.current?.value || "",
            output_file_name: outputFileNameRef.current?.value || "",
            shell: shellRef.current?.value || "",
        }

        // error handling for updateConfig when updateConfig is empty report to extension
        if (Object.keys(updateConfig).length === 0) {
            console.log("For some reason the extension config is empty, please check the extension config.");
            vscode.postMessage({
                type: "error",
                content: "The extension config in react updateConfig is empty, please check the extension config.",
            })
            return;
        }

        // error handling for updateConfig when updateConfig has empty value report to extension
        const emptyKeys = (Object.keys(updateConfig) as Array<keyof IExtensionConfig>).filter(key => !updateConfig[key]);
        if (emptyKeys.length > 0) {
            const errorMsg = `The following configuration fields are empty: ${emptyKeys.join(', ')}. Please fill them in.`;
            console.log(errorMsg);
            vscode.postMessage({
                type: "error",
                content: errorMsg,
            });
            return;
        }

        console.log(`ready to post update extension config to extension: ${JSON.stringify(updateConfig)}`)

        // post update extension config to extension
        vscode.postMessage({
            type: "updateExtensionConfig",
            content: updateConfig,
        })

        // update extension config in react state
        setExtensionConfig(updateConfig);

        // hide config view and return to steps
        setShowConfig(false);
    }



    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.for === "extensionConfigMessage") {
                // unused variables removed
                console.log(`receive message about config from extension.`)
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [extensionConfig]);

    return (
        <div>
            <p className={`${css.config_title}`}>IDAES Extension Configration:</p>
            <form onSubmit={(e) => e.preventDefault()}>
                <div className={`${css.config_control}`}>
                    <label htmlFor="shell_type">Shell type (e.g. zsh, bash, fish, etc.):</label>
                    <input
                        type="text"
                        id="shell_type"
                        value={extensionConfig?.shell || ""}
                        onChange={(e) => setExtensionConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), shell: e.target.value }))}
                        ref={shellRef}
                    />
                </div>
                <div className={`${css.config_control}`}>
                    <label htmlFor="sorce_treminal">Command to sorce your terminal (e.g. source .zshrc):</label>
                    <input
                        type="text"
                        id="sorce_treminal"
                        value={extensionConfig?.sorce_treminal || ""}
                        onChange={(e) => setExtensionConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), sorce_treminal: e.target.value }))}
                        ref={sorceTerminalRef}
                    />
                </div>
                <div className={`${css.config_control}`}>
                    <label htmlFor="activate_command">Command to activate your environment (e.g. conda activate idaes_dev):</label>
                    <input
                        type="text"
                        id="activate_command"
                        value={extensionConfig?.activate_command || ""}
                        onChange={(e) => setExtensionConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), activate_command: e.target.value }))}
                        ref={activateCommandRef}
                    />
                </div>
                <div className={`${css.config_control}`}>
                    <label htmlFor="output_file_name">Output file name (Full path):</label>
                    <input
                        type="text"
                        id="output_file_name"
                        value={extensionConfig?.output_file_name || ""}
                        onChange={(e) => setExtensionConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), output_file_name: e.target.value }))}
                        ref={outputFileNameRef}
                    />
                </div>
                <button type="button" className={`${css.update_button}`} onClick={(e) => { e.preventDefault(); updateConfigHandler(); }}>Update</button>
            </form>
        </div>
    );
}