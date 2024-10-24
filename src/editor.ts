import { ISessionContext, showErrorMessage } from '@jupyterlab/apputils';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { DocumentModel, DocumentWidget } from '@jupyterlab/docregistry';
import { ILogPayload } from '@jupyterlab/logconsole';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Kernel } from '@jupyterlab/services';
import { IInputRequestMsg } from '@jupyterlab/services/lib/kernel/messages';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CommandToolbarButton, kernelIcon } from '@jupyterlab/ui-components';

import { CommandRegistry } from '@lumino/commands';
import { Signal } from '@lumino/signaling';
import { SplitPanel } from '@lumino/widgets';

import { CommandIDs } from './commands';
import {
    MONACO_PATH,
    PLUGIN_ID,
    SERVE_MONACO,
    WALDIEZ_STRINGS
} from './constants';
import { WaldiezLogger } from './logger';
import { getWaldiezActualPath, uploadFile } from './rest';
import { WaldiezRunner } from './runner';
import { EditorWidget } from './widget';

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
    private _stdinRequest: IInputRequestMsg | null = null;
    private _inputPrompt: Signal<
        this,
        { previousMessages: string[]; prompt: string } | null | null
    >;
    private _logger: WaldiezLogger;
    private _runner: WaldiezRunner;
    private _restartKernelCommandId: string;
    private _restartKernelButton: CommandToolbarButton;
    /**
     * Construct a new WaldiezEditor.
     * @param options - The WaldiezEditor instantiation options.
     * @public
     */
    constructor(options: WaldiezEditor.IOptions) {
        super(options);
        this._commands = options.commands;
        this._settingsRegistry = options.settingregistry;
        this._inputPrompt = new Signal<
            this,
            { previousMessages: string[]; prompt: string } | null | null
        >(this);
        this._logger = new WaldiezLogger({
            commands: this._commands,
            editorId: this.id,
            panel: this.content,
            rendermime: options.rendermime
        });
        this._restartKernelCommandId = `${CommandIDs.restartKernel}-${this.id}`;
        this._restartKernelButton = new CommandToolbarButton({
            commands: this._commands,
            id: this._restartKernelCommandId,
            icon: kernelIcon,
            label: ` ${WALDIEZ_STRINGS.RESTART_KERNEL}`
        });
        this.toolbar.addItem(
            'toggle-logs-view',
            this._logger.toggleConsoleViewButton
        );
        this.toolbar.addItem('restart-kernel', this._restartKernelButton);
        this._runner = new WaldiezRunner({
            logger: this._logger,
            onStdin: this._onStdin.bind(this)
        });
        this.context.ready.then(this._onContextReady.bind(this));
        this.context.sessionContext.statusChanged.connect(
            this._onSessionStatusChanged,
            this
        );
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
        this._runner.reset();
        if (this._commands.hasCommand(this._restartKernelCommandId)) {
            this._commands.notifyCommandChanged(this._restartKernelCommandId);
        }
    }
    /**
     * Handle the kernel status change.
     * @param _context - The session context.
     * @param status - The kernel status.
     * @private
     * @memberof WaldiezEditor
     */
    private _onSessionStatusChanged(
        _context: ISessionContext,
        status: Kernel.Status
    ): void {
        this._logger.log({
            data: WALDIEZ_STRINGS.KERNEL_STATUS_CHANGED(status),
            level: 'debug',
            type: 'text'
        });
    }
    // handle context ready event
    private _onContextReady(): void {
        this._getServeMonacoSetting().then(serveMonaco => {
            const waldiezWidget = this._getWaldiezWidget(serveMonaco);
            this.content.addWidget(waldiezWidget);
            const payload: ILogPayload = {
                data: WALDIEZ_STRINGS.LOGGER_INITIALIZED,
                level: 'info',
                type: 'text'
            };
            this._logger.log(payload);
        });
    }
    //
    private _initCommands(): void {
        if (!this._commands.hasCommand(this._restartKernelCommandId)) {
            this._commands.addCommand(this._restartKernelCommandId, {
                execute: this._onRestartKernel.bind(this),
                label: ` ${WALDIEZ_STRINGS.RESTART_KERNEL}`
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
    private _onContentChanged(contents: string): void {
        const currentContents = this.context.model.toString();
        if (contents !== currentContents) {
            this.context.model.fromString(contents);
            this.context.model.dirty = true;
        }
    }
    //
    private _getServeMonacoSetting() {
        return new Promise<boolean>(resolve => {
            this._settingsRegistry
                .get(PLUGIN_ID, SERVE_MONACO)
                .then(setting => {
                    resolve(setting.composite as boolean);
                })
                .catch(_ => {
                    console.error(_);
                    resolve(false);
                });
        });
    }
    private onUpload(files: File[]): Promise<string[]> {
        return new Promise<string[]>(resolve => {
            const paths: string[] = [];
            const promises = files.map(async file => {
                try {
                    const path = await uploadFile(file);
                    paths.push(path);
                } catch (err) {
                    const errorString =
                        err instanceof Error
                            ? err.message
                            : typeof err === 'string'
                              ? err
                              : ((err as any).toString() ?? 'Unknown error');
                    this._logger.log({
                        data: errorString,
                        level: 'error',
                        type: 'text'
                    });
                }
            });
            Promise.all(promises).then(() => {
                resolve(paths);
            });
        });
    }
    //
    private _getWaldiezWidget(serveMonaco: boolean): EditorWidget {
        const fileContents = this.context.model.toString();
        let jsonData = {};
        try {
            jsonData = JSON.parse(fileContents);
        } catch (_) {
            // no-op (empty/new file?)
        }
        const vsPath = serveMonaco ? MONACO_PATH : null;
        return new EditorWidget({
            flowId: this.id,
            jsonData,
            inputPrompt: this._inputPrompt,
            vsPath,
            onChange: this._onContentChanged.bind(this),
            onRun: this._onRun.bind(this),
            onUserInput: this._onUserInput.bind(this),
            onUpload: this.onUpload
        });
    }
    // handle user input request and response
    // - request: prompt user for input
    private _onStdin(msg: IInputRequestMsg): void {
        let prompt = (msg as IInputRequestMsg).content.prompt;
        if (prompt === '>' || prompt === '> ') {
            prompt = WALDIEZ_STRINGS.ON_EMPTY_PROMPT;
        }
        this._logger.log({
            data: prompt,
            level: 'warning',
            type: 'text'
        });
        this._stdinRequest = msg;
        this._inputPrompt.emit({
            previousMessages: this._runner.getPreviousMessages(prompt),
            prompt
        });
    }
    // - response: send user's input to kernel
    private _onUserInput(userInput: string): void {
        this._inputPrompt.emit(null);
        if (this._stdinRequest) {
            this.context.sessionContext.session?.kernel?.sendInputReply(
                { value: userInput, status: 'ok' },
                this._stdinRequest.parent_header as any
            );
            this._stdinRequest = null;
        }
    }
    //
    private _onRun(_contents: string) {
        const kernel = this.context.sessionContext.session?.kernel;
        if (!kernel) {
            showErrorMessage(
                WALDIEZ_STRINGS.NO_KERNEL,
                WALDIEZ_STRINGS.NO_KERNEL_MESSAGE
            );
            return;
        }
        if (!this._logger.isVisible) {
            this._logger.toggle();
        }
        if (this.context.model.dirty) {
            this.context.save();
        }
        getWaldiezActualPath(this.context.path)
            .then(actualPath => {
                this._runner.run(kernel, actualPath);
            })
            .catch(err => {
                this._logger.log({
                    data: err,
                    level: 'error',
                    type: 'text'
                });
            });
    }
}

export namespace WaldiezEditor {
    export interface IOptions
        extends DocumentWidget.IOptions<SplitPanel, DocumentModel> {
        rendermime: IRenderMimeRegistry;
        editorServices: IEditorServices;
        settingregistry: ISettingRegistry;
        commands: CommandRegistry;
    }
}
