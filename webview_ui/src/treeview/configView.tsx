import { useEffect, useContext, useState, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AppContext } from "../context";
import { vscode } from "../vscode";
import type { IExtensionConfig } from "../interface/interface";
import css from "../css/config.module.css";

export default function ConfigView({ setShowConfig }: { setShowConfig: Dispatch<SetStateAction<boolean>> }) {
    const { extensionConfig, setExtensionConfig } = useContext(AppContext);
    
    // We use a local config state so we don't mutate the global context on every keystroke
    const [localConfig, setLocalConfig] = useState<IExtensionConfig | null>(null);

    useEffect(() => {
        if (extensionConfig) {
            setLocalConfig(extensionConfig);
        }
    }, [extensionConfig]);

    if (localConfig) {
        console.log(`get extension config: ${JSON.stringify(localConfig)}`)
    }

    function updateConfigHandler() {
        const updateConfig: IExtensionConfig = {
            activate_command: localConfig?.activate_command || "",
            sorce_treminal: localConfig?.sorce_treminal || "",
            output_file_name: localConfig?.output_file_name || "",
            shell: localConfig?.shell || "",
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

    function cancelConfigHandler() {
        // Revert local form state to the currently saved extensionConfig
        if (extensionConfig) {
            setLocalConfig(extensionConfig);
        }
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
    }, []);

    return (
        <div>
            <p className={`${css.config_title}`}>IDAES Extension Configration:</p>
            <form onSubmit={(e) => e.preventDefault()}>
                <div className={`${css.config_control}`}>
                    <label htmlFor="shell_type">Shell type (e.g. zsh, bash, fish, etc.):</label>
                    <input
                        type="text"
                        id="shell_type"
                        value={localConfig?.shell || ""}
                        onChange={(e) => setLocalConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), shell: e.target.value }))}
                    />
                </div>
                <div className={`${css.config_control}`}>
                    <label htmlFor="sorce_treminal">Command to sorce your terminal (e.g. source .zshrc):</label>
                    <input
                        type="text"
                        id="sorce_treminal"
                        value={localConfig?.sorce_treminal || ""}
                        onChange={(e) => setLocalConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), sorce_treminal: e.target.value }))}
                    />
                </div>
                <div className={`${css.config_control}`}>
                    <label htmlFor="activate_command">Command to activate your environment (e.g. conda activate idaes_dev):</label>
                    <input
                        type="text"
                        id="activate_command"
                        value={localConfig?.activate_command || ""}
                        onChange={(e) => setLocalConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), activate_command: e.target.value }))}
                    />
                </div>
                <div className={`${css.config_control}`}>
                    <label htmlFor="output_file_name">Output file name (Full path):</label>
                    <input
                        type="text"
                        id="output_file_name"
                        value={localConfig?.output_file_name || ""}
                        onChange={(e) => setLocalConfig(prev => ({ ...(prev || { activate_command: "", sorce_treminal: "", output_file_name: "", shell: "" }), output_file_name: e.target.value }))}
                    />
                </div>
                <div className={`${css.button_group}`}>
                    <button type="button" className={`${css.update_button}`} onClick={(e) => { e.preventDefault(); updateConfigHandler(); }}>Update</button>
                    <button type="button" className={`${css.update_button} ${css.cancel_button}`} onClick={(e) => { e.preventDefault(); cancelConfigHandler(); }}>Cancel</button>
                </div>
            </form>
        </div>
    );
}