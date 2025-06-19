/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { ReactWidget, UseSignal } from "@jupyterlab/ui-components";
import { ISignal } from "@lumino/signaling";

import { JSX } from "react";

import { Waldiez, WaldiezChatConfig, WaldiezProps, importFlow } from "@waldiez/react";
import "@waldiez/react/dist/@waldiez.css";

/**
 * The props for the Waldiez editor widget.
 * It contains the flow id, the vs path, and the flow as json data.
 * It also contains the onRun, onChange, onUserInput callbacks
 *  and the input prompt signal.
 * @param flowId The flow id
 * @param vsPath The vs path (to serve monaco editor files or not[null])
 * @param jsonData The json data (waldiez flow)
 * @param onRun The onRun callback
 * @param onChange The onChange callback
 * @param onUserInput The onUserInput callback
 * @param inputPrompt The input prompt signal
 * @returns The props for the Waldiez editor widget
 */
export interface IWaldiezWidgetProps {
    flowId: string;
    vsPath?: string;
    jsonData: Record<string, any>;
    chat: ISignal<any, WaldiezChatConfig | undefined>;
    onRun?: (flow: string) => void;
    onConvert?: (flow: string, to: "py" | "ipynb") => void;
    onChange?: (content: string) => void;
    onUpload?: (files: File[]) => Promise<string[]>;
}

/**
 * A widget for Waldiez editor.
 * It contains the Waldiez component.
 * It also listens to the input prompt signal.
 * It passes the input prompt to the Waldiez component.
 * It also listens to the change signal.
 * @param props The props for the widget
 */
export class EditorWidget extends ReactWidget {
    private _chat: ISignal<any, WaldiezChatConfig | undefined>;
    // private _onUserInput: (userInput: WaldiezChatUserInput) => void;

    private _waldiez: WaldiezProps;

    constructor(props: IWaldiezWidgetProps) {
        super();
        this.addClass("jp-waldiez-widget");
        this._chat = props.chat;
        const flow = importFlow(props.jsonData);
        this._waldiez = {
            ...flow,
            flowId: props.flowId,
            storageId: flow.storageId ?? props.flowId,
            onChange: props.onChange,
            onRun: props.onRun,
            onConvert: props.onConvert,
            onUpload: props.onUpload,
            monacoVsPath: props.vsPath,
        };
    }

    render(): JSX.Element {
        return (
            <UseSignal
                signal={this._chat}
                initialArgs={null}
                children={(_, chat) => {
                    return <Waldiez {...this._waldiez} chat={chat !== null ? chat : undefined} />;
                }}
            />
        );
    }
}
