/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { ReactWidget, UseSignal } from "@jupyterlab/ui-components";
import type { ISignal } from "@lumino/signaling";

import type { JSX } from "react";

import {
    Waldiez,
    type WaldiezBreakpoint,
    type WaldiezChatConfig,
    type WaldiezProps,
    type WaldiezStepByStep,
    importFlow,
} from "@waldiez/react";
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
    signal: ISignal<any, { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }>;
    onRun?: (flow: string) => void;
    onStepRun?: (
        flow: string,
        breakpoints?: (string | WaldiezBreakpoint)[],
        checkpoint?: string | null,
    ) => void;
    onConvert?: (flow: string, to: "py" | "ipynb") => void;
    onSave?: (content: string) => void;
    onUpload?: (files: File[]) => Promise<string[]>;
    checkpoints?: {
        get: (flowName: string) => Promise<Record<string, any> | null>;
        set?: (flowName: string, checkpoint: Record<string, any>) => Promise<void>;
    };
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
    private readonly _signal: ISignal<
        any,
        { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }
    >;

    private readonly _waldiez: WaldiezProps;

    constructor(props: IWaldiezWidgetProps) {
        super();
        this.addClass("jp-waldiez-widget");
        this._signal = props.signal;
        const flow = importFlow(props.jsonData);
        this._waldiez = {
            ...flow,
            flowId: props.flowId,
            storageId: flow.storageId ?? /* istanbul ignore next */ props.flowId,
            onSave: props.onSave,
            onRun: props.onRun,
            onStepRun: props.onStepRun,
            onConvert: props.onConvert,
            onUpload: props.onUpload,
            checkpoints: props.checkpoints,
            monacoVsPath: props.vsPath,
        };
    }

    render(): JSX.Element {
        return (
            <UseSignal
                signal={this._signal}
                initialArgs={null}
                children={(_, signal) => {
                    /* istanbul ignore next */
                    return (
                        <Waldiez
                            {...this._waldiez}
                            chat={signal ? signal.chat : undefined}
                            stepByStep={signal ? signal.stepByStep : undefined}
                        />
                    );
                }}
            />
        );
    }
}
