import { Waldiez, WaldiezProps, importFlow } from '@waldiez/react';
import '@waldiez/react/dist/style.css';

import { ReactWidget, UseSignal } from '@jupyterlab/ui-components';

import { ISignal } from '@lumino/signaling';

import { JSX } from 'react';

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
    inputPrompt: ISignal<
        any,
        { previousMessages: string[]; prompt: string } | null
    >;
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
    private _inputPrompt: ISignal<
        any,
        { previousMessages: string[]; prompt: string } | null
    >;

    private _waldiez: WaldiezProps;

    constructor(props: IWaldiezEditorProps) {
        super();
        this.addClass('jp-waldiez-widget');
        this._inputPrompt = props.inputPrompt;
        const flow = importFlow(props.jsonData);
        this._waldiez = {
            flowId: props.flowId,
            name: flow.name,
            description: flow.description,
            requirements: flow.requirements,
            tags: flow.tags,
            edges: flow.edges,
            nodes: flow.nodes,
            viewport: flow.viewport,
            storageId: flow.storageId ?? props.flowId,
            onChange: props.onChange,
            onRun: props.onRun,
            onUserInput: props.onUserInput,
            onUpload: props.onUpload,
            monacoVsPath: props.vsPath
        };
    }

    render(): JSX.Element {
        return (
            <UseSignal
                signal={this._inputPrompt}
                initialArgs={null}
                children={(_, inputPrompt) => (
                    <Waldiez
                        flowId={this._waldiez.flowId}
                        name={this._waldiez.name}
                        storageId={this._waldiez.storageId}
                        description={this._waldiez.description}
                        requirements={this._waldiez.requirements}
                        tags={this._waldiez.tags}
                        edges={this._waldiez.edges}
                        nodes={this._waldiez.nodes}
                        viewport={this._waldiez.viewport}
                        onChange={this._waldiez.onChange}
                        monacoVsPath={this._waldiez.monacoVsPath}
                        onUserInput={this._waldiez.onUserInput}
                        onRun={this._waldiez.onRun}
                        onUpload={this._waldiez.onUpload}
                        inputPrompt={inputPrompt}
                    />
                )}
            />
        );
    }
}
