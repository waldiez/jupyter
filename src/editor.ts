/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { CommandIDs } from "./commands";
import { PLUGIN_ID, SERVE_MONACO, WALDIEZ_STRINGS } from "./constants";
import { WaldiezLogger } from "./logger";
import { getWaldiezActualPath, handleExport, uploadFile } from "./rest";
import { WaldiezRunner } from "./runner";
import { EditorWidget } from "./widget";
import { ISessionContext, showErrorMessage } from "@jupyterlab/apputils";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { DocumentModel, DocumentWidget } from "@jupyterlab/docregistry";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import { ILogPayload } from "@jupyterlab/logconsole";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { Kernel, ServerConnection } from "@jupyterlab/services";
import { IInputRequestMsg } from "@jupyterlab/services/lib/kernel/messages";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { CommandToolbarButton, kernelIcon } from "@jupyterlab/ui-components";
import { CommandRegistry } from "@lumino/commands";
import { Signal } from "@lumino/signaling";
import { SplitPanel } from "@lumino/widgets";

import {
    WaldiezChatConfig,
    WaldiezChatMessage,
    WaldiezChatUserInput,
    WaldiezTimelineData,
} from "@waldiez/react";

/**
 * A Waldiez editor.
 * It is a document widget that contains a split panel with an editor widget and a logger.
 * The editor widget is used to edit a waldiez file.
 * The logger is used to log the messages from the kernel.
 * @public
 * @extends DocumentWidget
 * @param <SplitPanel> The type of widget to create
 * @param <DocumentModel> The type of model to use
 */
export class WaldiezEditor extends DocumentWidget<SplitPanel, DocumentModel> {
    private _commands: CommandRegistry;
    private _settingsRegistry: ISettingRegistry;
    private _fileBrowserFactory: IFileBrowserFactory;
    private _inputRequestId: string | null = null;
    private _stdinRequest: IInputRequestMsg | null = null;
    private _chat: Signal<this, WaldiezChatConfig | undefined>;
    private _logger: WaldiezLogger;
    private _runner: WaldiezRunner;
    private _restartKernelCommandId: string;
    private _interruptKernelCommandId: string;
    private _restartKernelButton: CommandToolbarButton;
    private _interruptKernelButton: CommandToolbarButton;
    private _serverSettings: ServerConnection.ISettings;
    /**
     * Construct a new WaldiezEditor.
     * @param options - The WaldiezEditor instantiation options.
     * @public
     */
    constructor(options: WaldiezEditor.IOptions) {
        super(options);
        this._commands = options.commands;
        this._settingsRegistry = options.settingregistry;
        this._fileBrowserFactory = options.fileBrowserFactory;
        this._chat = new Signal<this, WaldiezChatConfig | undefined>(this);
        this._logger = new WaldiezLogger({
            commands: this._commands,
            editorId: this.id,
            panel: this.content,
            rendermime: options.rendermime,
        });
        this._restartKernelCommandId = `${CommandIDs.restartKernel}-${this.id}`;
        this._interruptKernelCommandId = `${CommandIDs.interruptKernel}-${this.id}`;
        this._restartKernelButton = new CommandToolbarButton({
            commands: this._commands,
            id: this._restartKernelCommandId,
            icon: kernelIcon,
            label: ` ${WALDIEZ_STRINGS.RESTART_KERNEL}`,
        });
        this._interruptKernelButton = new CommandToolbarButton({
            commands: this._commands,
            id: this._interruptKernelCommandId,
            icon: kernelIcon,
            label: ` ${WALDIEZ_STRINGS.INTERRUPT_KERNEL}`,
        });
        this.toolbar.addItem("toggle-logs-view", this._logger.toggleConsoleViewButton);
        this.toolbar.addItem("clear-logs", this._interruptKernelButton);
        this.toolbar.addItem("restart-kernel", this._restartKernelButton);
        this._serverSettings = ServerConnection.makeSettings();
        this._runner = new WaldiezRunner({
            logger: this._logger,
            baseUrl: this._serverSettings.baseUrl,
            onInputRequest: this._onInputRequest.bind(this),
            onStdin: this._onStdin.bind(this),
            onMessagesUpdate: this._onMessagesUpdate.bind(this),
            onTimelineData: this._onTimelineData.bind(this),
            onEnd: this._onEnd.bind(this),
        });
        this.context.ready.then(this._onContextReady.bind(this));
        this.context.sessionContext.statusChanged.connect(this._onSessionStatusChanged, this);
        this._initCommands();
    }
    /**
     * Clean up.
     * @public
     * @memberof WaldiezEditor
     */
    dispose(): void {
        super.dispose();
        this.content.dispose();
        this._logger.dispose();
        this._restartKernelButton.dispose();
        if (this._commands.hasCommand(this._restartKernelCommandId)) {
            this._commands.notifyCommandChanged(this._restartKernelCommandId);
        }
        this._interruptKernelButton.dispose();
        if (this._commands.hasCommand(this._interruptKernelCommandId)) {
            this._commands.notifyCommandChanged(this._interruptKernelCommandId);
        }
        this._runner.reset();
        this._runner.setTimelineData(undefined);
    }
    /**
     * Handle the kernel status change.
     * @param _context - The session context.
     * @param status - The kernel status.
     * @private
     * @memberof WaldiezEditor
     */
    private _onSessionStatusChanged(_context: ISessionContext, status: Kernel.Status): void {
        this._logger.log({
            data: WALDIEZ_STRINGS.KERNEL_STATUS_CHANGED(status),
            level: "debug",
            type: "text",
        });
    }
    // handle context ready event
    private _onContextReady(): void {
        this._getServeMonacoSetting().then(vsPath => {
            const waldiezWidget = this._getWaldiezWidget(vsPath || undefined);
            this.content.addWidget(waldiezWidget);
            const payload: ILogPayload = {
                data: WALDIEZ_STRINGS.LOGGER_INITIALIZED,
                level: "info",
                type: "text",
            };
            this._logger.log(payload);
        });
    }
    //
    private _initCommands(): void {
        if (!this._commands.hasCommand(this._restartKernelCommandId)) {
            this._commands.addCommand(this._restartKernelCommandId, {
                execute: this._onRestartKernel.bind(this),
                label: ` ${WALDIEZ_STRINGS.RESTART_KERNEL}`,
            });
        }
        if (!this._commands.hasCommand(this._interruptKernelCommandId)) {
            this._commands.addCommand(this._interruptKernelCommandId, {
                execute: this._onInterruptKernel.bind(this),
                label: ` ${WALDIEZ_STRINGS.INTERRUPT_KERNEL}`,
            });
        }
    }
    //
    private _onRestartKernel(): void {
        const session = this.context.sessionContext.session;
        if (session?.kernel) {
            session.kernel.restart();
        }
    }
    //
    private _onInterruptKernel(): void {
        const session = this.context.sessionContext.session;
        if (session?.kernel) {
            session.kernel.interrupt();
        }
    }
    //
    private _onContentChanged(contents: string, markDirty: boolean = true): void {
        const currentContents = this.context.model.toString();
        if (contents !== currentContents) {
            this.context.model.fromString(contents);
            if (markDirty) {
                this.context.model.dirty = true;
            } else {
                this.context.save();
            }
        }
    }
    //
    private _getServeMonacoSetting() {
        return new Promise<string | null>(resolve => {
            this._settingsRegistry
                .get(PLUGIN_ID, SERVE_MONACO)
                .then(setting => {
                    const doServe = (setting.composite as boolean) || false;
                    if (doServe) {
                        const fullUrl = this._serverSettings.baseUrl;
                        let withOutHost = fullUrl.replace(/https?:\/\/[^/]+/, "");
                        if (!withOutHost.endsWith("/")) {
                            withOutHost += "/";
                        }
                        resolve(`${withOutHost}static/vs`);
                    } else {
                        resolve(null);
                    }
                })
                .catch(_ => {
                    console.error(_);
                    resolve(null);
                });
        });
    }
    //
    private onUpload(files: File[]): Promise<string[]> {
        return new Promise<string[]>(resolve => {
            const paths: string[] = [];
            const promises = files.map(async file => {
                try {
                    const path = await uploadFile(file);
                    paths.push(path);
                } catch (err) {
                    let errorString = "Unknown error";
                    if (err instanceof Error) {
                        errorString = err.message;
                    }
                    if (typeof err === "string") {
                        errorString = err;
                    }
                    if (typeof (err as any).toString === "function") {
                        errorString = (err as any).toString();
                    }
                    if (typeof (err as any).message === "string") {
                        errorString = (err as any).message;
                    }
                    if (typeof err === "object" && err !== null) {
                        errorString = JSON.stringify(err);
                    }
                    this._logger.log({
                        data: errorString,
                        level: "error",
                        type: "text",
                    });
                }
            });
            Promise.all(promises).then(() => {
                resolve(paths);
            });
        });
    }
    //
    private _askForInput(): void {
        const messages = this._runner.getPreviousMessages();
        let request_id = "<unknown>";
        if (typeof this._stdinRequest?.metadata.request_id === "string") {
            request_id = this._stdinRequest.metadata.request_id;
        } else {
            request_id = this._inputRequestId ?? this._getRequestIdFromPreviousMessages(messages);
        }
        const chat: WaldiezChatConfig = {
            showUI: true,
            messages,
            timeline: undefined,
            userParticipants: this._runner.getUserParticipants(),
            activeRequest: {
                request_id,
                prompt: this._stdinRequest?.content.prompt ?? "> ",
                password: this._stdinRequest?.content.password ?? false,
            },
            handlers: {
                onUserInput: this._onUserInput.bind(this),
                onInterrupt: this._handleInterrupt.bind(this),
                onClose: this._handleClose.bind(this),
            },
        };
        this._chat.emit(chat);
    }
    //
    private _handleInterrupt(): void {
        this._stdinRequest = null;
        this._inputRequestId = null;
        this._runner.reset();
        this._runner.setTimelineData(undefined);
        this._chat.emit({
            showUI: false,
            messages: this._runner.getPreviousMessages(),
            timeline: undefined,
            userParticipants: this._runner.getUserParticipants(),
            activeRequest: undefined,
        });
        this._onRestartKernel();
    }
    //
    private _handleClose(): void {
        this._stdinRequest = null;
        this._inputRequestId = null;
        this._runner.reset();
        this._chat.emit({
            showUI: false,
            messages: this._runner.getPreviousMessages(),
            userParticipants: this._runner.getUserParticipants(),
            activeRequest: undefined,
            timeline: this._runner.getTimelineData(),
        });
    }
    //
    private _getWaldiezWidget(vsPath?: string): EditorWidget {
        const fileContents = this.context.model.toString();
        let jsonData = {};
        try {
            jsonData = JSON.parse(fileContents);
        } catch (_) {
            // no-op (empty/new file?)
        }
        return new EditorWidget({
            flowId: this.id,
            jsonData,
            vsPath,
            chat: this._chat,
            onChange: this._onContentChanged.bind(this),
            onRun: this._onRun.bind(this),
            onConvert: this._onConvert.bind(this),
            onUpload: this.onUpload,
        });
    }
    // handle user input request and response
    // - request: prompt user for input
    private _onStdin(msg: IInputRequestMsg): void {
        let prompt = (msg as IInputRequestMsg).content.prompt;
        if (prompt === ">" || prompt === "> ") {
            prompt = WALDIEZ_STRINGS.ON_EMPTY_PROMPT;
        }
        this._logger.log({
            data: prompt,
            level: "warning",
            type: "text",
        });
        this._stdinRequest = msg;
        this._askForInput();
    }
    //
    private _onInputRequest(requestId: string): void {
        this._inputRequestId = requestId;
    }
    // - response: send user's input to kernel
    private _onUserInput(userInput: WaldiezChatUserInput): void {
        if (this._stdinRequest) {
            this._logger.log({
                data: JSON.stringify(userInput),
                level: "info",
                type: "text",
            });
            this.context.sessionContext.session?.kernel?.sendInputReply(
                { value: JSON.stringify(userInput), status: "ok" },
                this._stdinRequest.parent_header as any,
            );
            this._stdinRequest = null;
        }
        // this._chat.emit(undefined);
    }
    //
    private _onRun(contents: string) {
        const kernel = this.context.sessionContext.session?.kernel;
        if (!kernel) {
            showErrorMessage(WALDIEZ_STRINGS.NO_KERNEL, WALDIEZ_STRINGS.NO_KERNEL_MESSAGE);
            return;
        }
        if (!this._logger.isVisible) {
            this._logger.toggle();
        }
        this._onContentChanged(contents, false);
        this._chat.emit(undefined);
        getWaldiezActualPath(this.context.path)
            .then(actualPath => {
                this._runner.run(kernel, actualPath);
            })
            .catch(err => {
                this._logger.log({
                    data: err,
                    level: "error",
                    type: "text",
                });
            });
    }
    private _onEnd(): void {
        this._chat.emit({
            showUI: false,
            messages: this._runner.getPreviousMessages(),
            timeline: this._runner.getTimelineData(),
            userParticipants: this._runner.getUserParticipants(),
            activeRequest: undefined,
        });
    }
    //
    private _onMessagesUpdate(isInputRequest: boolean): void {
        const messages = this._runner.getPreviousMessages();
        this._chat.emit({
            showUI: messages.length > 0,
            messages,
            timeline: undefined,
            userParticipants: this._runner.getUserParticipants(),
            activeRequest: isInputRequest
                ? {
                      request_id: this._inputRequestId ?? this._getRequestIdFromPreviousMessages(messages),
                      prompt: this._stdinRequest?.content.prompt ?? "> ",
                      password: this._stdinRequest?.content.password ?? false,
                  }
                : undefined,
            handlers: {
                onUserInput: this._onUserInput.bind(this),
                onInterrupt: this._handleInterrupt.bind(this),
                onClose: this._handleClose.bind(this),
            },
        });
    }
    //
    private _onTimelineData(data: WaldiezTimelineData): void {
        this._chat.emit({
            showUI: false,
            messages: this._runner.getPreviousMessages(),
            timeline: data,
            userParticipants: this._runner.getUserParticipants(),
            activeRequest: undefined,
            handlers: {
                onUserInput: this._onUserInput.bind(this),
                onClose: this._handleClose.bind(this),
            },
        });
    }
    //
    private _getRequestIdFromPreviousMessages(previousMessages: WaldiezChatMessage[]): string {
        const inputRequestMessage = previousMessages.find(msg => msg.type === "input_request");
        if (inputRequestMessage) {
            return inputRequestMessage.request_id ?? "<unknown>";
        }
        return "<unknown>";
    }

    //
    private _onConvert(_flow: string, to: "py" | "ipynb"): void {
        handleExport(this._fileBrowserFactory, to);
    }
}

export namespace WaldiezEditor {
    export interface IOptions extends DocumentWidget.IOptions<SplitPanel, DocumentModel> {
        rendermime: IRenderMimeRegistry;
        editorServices: IEditorServices;
        settingregistry: ISettingRegistry;
        commands: CommandRegistry;
        fileBrowserFactory: IFileBrowserFactory;
    }
}
