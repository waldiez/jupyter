/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { ReactWidget, UseSignal } from "@jupyterlab/ui-components";
import { ISignal } from "@lumino/signaling";

import { JSX } from "react";

import { Waldiez, WaldiezProps, importFlow } from "@waldiez/react";
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
export interface IWaldiezEditorProps {
    flowId: string;
    vsPath: string | null;
    jsonData: Record<string, any>;
    onRun?: (flow: string) => void;
    onChange?: (content: string) => void;
    onUserInput?: (userInput: string) => void;
    onUpload?: (files: File[]) => Promise<string[]>;
    inputPrompt: ISignal<any, { previousMessages: string[]; prompt: string } | null>;
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
    private _inputPrompt: ISignal<any, { previousMessages: string[]; prompt: string } | null>;

    private _waldiez: WaldiezProps;

    constructor(props: IWaldiezEditorProps) {
        super();
        this.addClass("jp-waldiez-widget");
        this._inputPrompt = props.inputPrompt;
        const flow = importFlow(props.jsonData);
        this._waldiez = {
            ...flow,
            flowId: props.flowId,
            storageId: flow.storageId ?? props.flowId,
            onChange: props.onChange,
            onRun: props.onRun,
            onUserInput: props.onUserInput,
            onUpload: props.onUpload,
            monacoVsPath: props.vsPath,
        };
    }

    render(): JSX.Element {
        return (
            <UseSignal
                signal={this._inputPrompt}
                initialArgs={null}
                children={(_, inputPrompt) => <Waldiez {...this._waldiez} inputPrompt={inputPrompt} />}
            />
        );
    }
}
