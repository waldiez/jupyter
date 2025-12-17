/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WALDIEZ_STRINGS } from "../constants";
import { WaldiezLogger } from "../logger";
import { handleConvert, handleGetCheckpoints, handleSubmitCheckpoint, uploadFile } from "../rest";
import { EditorWidget } from "../widget";
import { WaldiezExecutionManager } from "./executionManager";
import { WaldiezKernelManager } from "./kernelManager";
import type { IExecutionContext } from "./types";
import { showErrorMessage } from "@jupyterlab/apputils";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { DocumentModel, DocumentWidget } from "@jupyterlab/docregistry";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import type { ILogPayload } from "@jupyterlab/logconsole";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { ServerConnection } from "@jupyterlab/services";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { CommandRegistry } from "@lumino/commands";
import { Signal } from "@lumino/signaling";
import { SplitPanel } from "@lumino/widgets";

import {
    type WaldiezBreakpoint,
    type WaldiezChatConfig,
    type WaldiezStepByStep,
    showSnackbar,
} from "@waldiez/react";

/**
 * A Waldiez editor.
 * It is a document widget that contains a split panel with an editor widget and a logger.
 * The editor widget is used to edit a waldiez file.
 * The logger is used to log the messages from the kernel.
 */
export class WaldiezEditor extends DocumentWidget<SplitPanel, DocumentModel> {
    private readonly _commands: CommandRegistry;
    private readonly _fileBrowserFactory: IFileBrowserFactory;
    private readonly _signal: Signal<
        this,
        { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }
    >;
    private readonly _logger: WaldiezLogger;
    private readonly _kernelManager: WaldiezKernelManager;
    private readonly _executionManager: WaldiezExecutionManager;
    private readonly _serverSettings: ServerConnection.ISettings;

    /**
     * Construct a new WaldiezEditor.
     * @param options - The WaldiezEditor instantiation options.
     */
    constructor(options: WaldiezEditor.IOptions) {
        super(options);
        this._commands = options.commands;
        this._fileBrowserFactory = options.fileBrowserFactory;
        this._serverSettings = ServerConnection.makeSettings();

        this._signal = new Signal<
            this,
            { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }
        >(this);

        this._logger = new WaldiezLogger({
            commands: this._commands,
            editorId: this.id,
            panel: this.content,
            rendermime: options.rendermime,
        });

        this._kernelManager = new WaldiezKernelManager(
            this._commands,
            this._logger,
            this.id,
            this.context.sessionContext,
        );

        this._executionManager = new WaldiezExecutionManager(
            this._logger,
            this._serverSettings.baseUrl,
            this._signal,
        );

        // Set dependencies for the execution manager
        this._executionManager.setDependencies(this.context.sessionContext, this._kernelManager);

        this._setupToolbar();
        this._setupEventHandlers();
    }

    private _setupToolbar(): void {
        this.toolbar.addItem("toggle-logs-view", this._logger.toggleConsoleViewButton);
        this.toolbar.addItem("clear-logs", this._kernelManager.interruptButton);
        this.toolbar.addItem("restart-kernel", this._kernelManager.restartButton);
    }

    private _setupEventHandlers(): void {
        this.context.ready.then(this._onContextReady.bind(this));
    }

    /**
     * Clean up.
     */
    dispose(): void {
        super.dispose();
        this.content.dispose();
        this._logger.dispose();
        this._kernelManager.dispose();
        this._executionManager.dispose();
    }

    private async _onContextReady(): Promise<void> {
        try {
            const url = new URL(this._serverSettings.baseUrl);
            let basePath = url.pathname;
            if (!basePath.endsWith("/")) {
                basePath += "/";
            }
            const vsPath = `${basePath}static/vs`;
            const waldiezWidget = this._getWaldiezWidget(vsPath);
            this.content.addWidget(waldiezWidget);

            const payload: ILogPayload = {
                data: WALDIEZ_STRINGS.LOGGER_INITIALIZED,
                level: "info",
                type: "text",
            };
            this._logger.log(payload);
        } catch (error) {
            this._logger.log({
                data: `Error initializing editor: ${error}`,
                level: "error",
                type: "text",
            });
        }
    }

    private async _onSave(contents: string): Promise<void> {
        const currentContents = this.context.model.toString();
        if (contents !== currentContents) {
            this.context.model.fromString(contents);
            await this.context.save();
            this.context.model.dirty = false;
        }
    }

    private async _onUpload(files: File[]): Promise<string[]> {
        const paths: string[] = [];
        const promises = files.map(async file => {
            try {
                const path = await uploadFile(file);
                paths.push(path);
            } catch (err) {
                const errorString = this._extractErrorMessage(err);
                this._logger.log({
                    data: errorString,
                    level: "error",
                    type: "text",
                });
            }
        });
        await Promise.all(promises);
        return paths;
    }

    private _extractErrorMessage(err: unknown): string {
        if (err instanceof Error) {
            return err.message;
        }
        if (typeof err === "string") {
            return err;
        }
        if (typeof (err as any)?.message === "string") {
            return (err as any).message;
        }
        if (typeof err === "object" && err !== null) {
            return JSON.stringify(err);
        }
        if (!err) {
            return "Unknown error";
        }
        return `${err}`;
    }

    private _getWaldiezWidget(vsPath?: string): EditorWidget {
        const fileContents = this.context.model.toString();
        let jsonData = {};
        try {
            jsonData = JSON.parse(fileContents);
        } catch {
            // no-op (empty/new file?)
        }

        return new EditorWidget({
            flowId: this.id,
            jsonData,
            vsPath,
            signal: this._signal,
            onSave: this._onSave.bind(this),
            onRun: this._onRun.bind(this),
            onStepRun: this._onStepRun.bind(this),
            onConvert: this._onConvert.bind(this),
            onUpload: this._onUpload.bind(this),
            checkpoints: {
                get: this._onGetCheckpoints.bind(this),
                set: this._onSetCheckpoint.bind(this),
            },
        });
    }

    private async _preRun(contents: string): Promise<boolean> {
        try {
            await this._onSave(contents);
            return true;
        } catch (err) {
            const errorMsg = `Error saving content: ${err}`;
            this._logger.log({
                data: errorMsg,
                level: "error",
                type: "text",
            });
            showSnackbar({
                flowId: this.id,
                message: errorMsg,
                level: "error",
            });
            return false;
        }
    }

    private async _onRun(contents: string): Promise<void> {
        if (!this._kernelManager.kernel) {
            await showErrorMessage(WALDIEZ_STRINGS.NO_KERNEL, WALDIEZ_STRINGS.NO_KERNEL_MESSAGE);
            return;
        }

        if (!this._logger.isVisible) {
            this._logger.toggle();
        }

        await this._preRun(contents);
        try {
            const context: IExecutionContext = {
                kernel: this._kernelManager.kernel,
                filePath: this.context.path,
                contents,
            };
            await this._executionManager.executeStandard(context);
        } catch (err) {
            const errorMsg = `Error executing flow: ${(err as Error).message || err}`;
            showSnackbar({
                flowId: this.id,
                message: errorMsg,
                level: "error",
            });
            this._logger.log({
                data: errorMsg,
                level: "error",
                type: "text",
            });
        }
    }

    private async _onStepRun(
        contents: string,
        breakpoints?: (string | WaldiezBreakpoint)[],
        checkpoint?: string | null,
    ): Promise<void> {
        if (!this._kernelManager.kernel) {
            await showErrorMessage(WALDIEZ_STRINGS.NO_KERNEL, WALDIEZ_STRINGS.NO_KERNEL_MESSAGE);
            return;
        }
        if (!this._logger.isVisible) {
            this._logger.toggle();
        }
        await this._preRun(contents);
        try {
            const context: IExecutionContext = {
                kernel: this._kernelManager.kernel,
                filePath: this.context.path,
                contents,
            };
            await this._executionManager.executeStepByStep(context, breakpoints, checkpoint);
        } catch (err) {
            const errorMsg = `Error executing flow: ${(err as Error).message || err}`;
            showSnackbar({
                flowId: this.id,
                message: errorMsg,
                level: "error",
            });
            this._logger.log({
                data: errorMsg,
                level: "error",
                type: "text",
            });
        }
    }

    private async _onConvert(flow: string, to: "py" | "ipynb"): Promise<void> {
        await this._onSave(flow);
        const waldiezFilePath = this.context.path;
        try {
            await handleConvert(waldiezFilePath, to);
            showSnackbar({
                flowId: this.id,
                message: WALDIEZ_STRINGS.EXPORT_SUCCESS(to),
                level: "info",
            });
        } catch (err) {
            const errorMsg = `Error converting to .${to}: ${(err as Error).message || err}`;
            showSnackbar({
                flowId: this.id,
                message: errorMsg,
                level: "error",
            });
            this._logger.log({
                data: errorMsg,
                level: "error",
                type: "text",
            });
        }
        try {
            // Refresh the file browser if it exists
            const fileBrowser = this._fileBrowserFactory.tracker.currentWidget;
            if (fileBrowser) {
                await fileBrowser.model.refresh();
            }

            this._logger.log({
                data: WALDIEZ_STRINGS.EXPORT_SUCCESS(to),
                level: "info",
                type: "text",
            });
        } catch {
            //
        }
    }
    private async _onGetCheckpoints(flowName: string): Promise<Record<string, any> | null> {
        try {
            return await handleGetCheckpoints(flowName);
        } catch (err) {
            const errorMsg = `Error getting checkpoints: ${err}`;
            showSnackbar({
                flowId: this.id,
                message: errorMsg,
                level: "error",
            });
            this._logger.log({
                data: errorMsg,
                level: "error",
                type: "text",
            });
            return null;
        }
    }
    private async _onSetCheckpoint(flowName: string, checkpoint: Record<string, any>): Promise<void> {
        try {
            await handleSubmitCheckpoint(flowName, checkpoint);
        } catch (err) {
            const errorMsg = `Error saving checkpoint: ${err}`;
            showSnackbar({
                flowId: this.id,
                message: errorMsg,
                level: "error",
            });
            this._logger.log({
                data: errorMsg,
                level: "error",
                type: "text",
            });
        }
    }
}

export namespace WaldiezEditor {
    export interface IOptions extends DocumentWidget.IOptions<SplitPanel, DocumentModel> {
        rendermime: IRenderMimeRegistry;
        editorServices: IEditorServices;
        settingRegistry: ISettingRegistry;
        commands: CommandRegistry;
        fileBrowserFactory: IFileBrowserFactory;
    }
}
