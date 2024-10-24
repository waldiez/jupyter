import { MainAreaWidget } from '@jupyterlab/apputils';
import {
    ILogPayload,
    ILogger,
    LogConsolePanel,
    LogLevel,
    LoggerRegistry
} from '@jupyterlab/logconsole';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import {
    IErrorMsg,
    IExecuteReplyMsg,
    IExecuteRequestMsg,
    IInputRequestMsg,
    IStreamMsg
} from '@jupyterlab/services/lib/kernel/messages';
import {
    CommandToolbarButton,
    clearIcon,
    consoleIcon
} from '@jupyterlab/ui-components';

import { CommandRegistry } from '@lumino/commands';
import { SplitPanel } from '@lumino/widgets';

import { CommandIDs } from './commands';
import { WALDIEZ_STRINGS } from './constants';

/**
 * A logger for the Waldiez extension.
 * It logs messages to the log console.
 * It also provides a button to toggle the log console view.
 * @param options The logger options
 */
export class WaldiezLogger {
    private _commands: CommandRegistry;
    private _id: string;
    private _panel: SplitPanel;
    private _rendermime: IRenderMimeRegistry;
    private _loggerRegistry: LoggerRegistry;
    private _logConsole: LogConsolePanel;
    private _widget: MainAreaWidget<LogConsolePanel>;
    private _toggleConsoleViewButton: CommandToolbarButton;
    private _widgetIsVisible: boolean;
    private _toggleConsoleViewCommandId: string;
    private _logConsoleClearCommandId: string;

    constructor(options: WaldiezLogger.IOptions) {
        this._id = options.editorId;
        this._commands = options.commands;
        this._rendermime = options.rendermime;
        this._logConsoleClearCommandId = `${CommandIDs.clearLogs}-${this._id}`;
        this._toggleConsoleViewCommandId = `${CommandIDs.toggleLogsView}-${this._id}`;
        this._loggerRegistry = new LoggerRegistry({
            defaultRendermime: this._rendermime,
            maxLength: 1000
        });
        this._logConsole = new LogConsolePanel(this._loggerRegistry);
        this._logConsole.id = `waldiez-log-console-${this._id}`;
        this._logConsole.title.label = WALDIEZ_STRINGS.LOG_CONSOLE;
        // not a fixed source,
        // if more than one editors is open at the same time,
        // we need to differentiate the logs
        this._logConsole.source = `Waldiez-${this._id}`;
        this._widgetIsVisible = false;
        // a button to toggle the log console view
        this._toggleConsoleViewButton = new CommandToolbarButton({
            commands: this._commands,
            id: this._toggleConsoleViewCommandId,
            icon: consoleIcon,
            label: () =>
                this._widgetIsVisible
                    ? ` ${WALDIEZ_STRINGS.HIDE_LOGS}`
                    : ` ${WALDIEZ_STRINGS.SHOW_LOGS}`
        });
        // the split panel to contain the log console
        this._panel = options.panel;
        this._widget = this._getLogWidget();
        this._getLogger().level = 'info';
    }
    /**
     * Get the toggle console view button.
     * @returns The toggle console view button
     * @public
     * @readonly
     * @memberof WaldiezLogger
     */
    get toggleConsoleViewButton(): CommandToolbarButton {
        return this._toggleConsoleViewButton;
    }
    /**
     * Get the visibility of the log console.
     * @returns The visibility of the log console
     * @public
     * @readonly
     * @memberof WaldiezLogger
     */
    get isVisible(): boolean {
        return this._widgetIsVisible;
    }
    /**
     * Get the log console widget.
     * @returns The log console widget
     * @public
     * @readonly
     * @memberof WaldiezLogger
     */
    get widget(): MainAreaWidget<LogConsolePanel> {
        return this._widget;
    }
    /**
     * Log a message to the log console.
     * @param msg The message to log
     * @public
     * @memberof WaldiezLogger
     */
    log(
        msg:
            | IStreamMsg
            | IErrorMsg
            | IInputRequestMsg
            | IExecuteReplyMsg
            | IExecuteRequestMsg
            | ILogPayload
    ): void {
        if ('level' in msg) {
            this._logData(msg);
        } else {
            if (msg.header.msg_type === 'error') {
                this._logData({
                    data: (msg as IErrorMsg).content.ename,
                    level: 'error',
                    type: 'text'
                });
                this._logData({
                    data: (msg as IErrorMsg).content.evalue,
                    level: 'error',
                    type: 'text'
                });
                this._logData({
                    data: (msg as IErrorMsg).content.traceback.join('\n'),
                    level: 'error',
                    type: 'text'
                });
            } else {
                if (msg.header.msg_type === 'stream') {
                    this._logIOPub(msg as IStreamMsg);
                } else if (msg.header.msg_type === 'input_request') {
                    this._logStdin(msg as IInputRequestMsg);
                } else if (msg.header.msg_type === 'execute_reply') {
                    this._logReply(msg as IExecuteReplyMsg);
                } else if (msg.header.msg_type === 'execute_request') {
                    this._logExecuteRequest(msg as IExecuteRequestMsg);
                }
            }
        }
        this._scrollToBottom();
    }
    /**
     * Toggle the log console view.
     * @public
     * @memberof WaldiezLogger
     */
    toggle(): void {
        if (this._widgetIsVisible) {
            this._widget.hide();
        } else {
            this._widget.show();
        }
        if (!this._panel.contains(this._widget)) {
            this._panel.addWidget(this._widget);
        }
        this._panel.setRelativeSizes([4, 1]);
        this._widgetIsVisible = !this._widgetIsVisible;
        this._toggleConsoleViewButton.update();
    }
    /**
     * Clear the log console.
     * @public
     * @memberof WaldiezLogger
     */
    clear(): void {
        this._getLogger().clear();
    }
    /**
     * Dispose the logger.
     * @public
     * @memberof WaldiezLogger
     */
    dispose(): void {
        this._logConsole.dispose();
        for (const commandId of [
            this._toggleConsoleViewCommandId,
            this._logConsoleClearCommandId
        ]) {
            if (this._commands.hasCommand(commandId)) {
                this._commands.notifyCommandChanged(commandId);
            }
        }
    }
    /**
     * Scroll to the bottom of the log console.
     * @param retry The number of retries
     * @private
     * @memberof WaldiezLogger
     */
    private _scrollToBottom(retry: number = 0): void {
        const logs = this._logConsole.node.querySelectorAll(
            '.jp-OutputArea-child'
        );
        if (!logs) {
            // too early?, try again
            if (retry < 5) {
                setTimeout(() => this._scrollToBottom(retry + 1), 1000);
                return;
            }
            return;
        }
        const lastLog = logs[logs.length - 1];
        if (lastLog) {
            lastLog.scrollIntoView();
        }
    }
    /**
     * Get the log console widget.
     * @returns The log console widget
     * @private
     * @memberof WaldiezLogger
     */
    private _getLogWidget(): MainAreaWidget<LogConsolePanel> {
        const logConsoleWidget = new MainAreaWidget<LogConsolePanel>({
            content: this._logConsole
        });
        logConsoleWidget.toolbar.addItem(
            'clear',
            new CommandToolbarButton({
                commands: this._commands,
                id: this._logConsoleClearCommandId
            })
        );
        if (!this._commands.hasCommand(this._logConsoleClearCommandId)) {
            this._commands.addCommand(this._logConsoleClearCommandId, {
                execute: () => this._getLogger().clear(),
                isEnabled: () =>
                    !!this._logConsole && this._logConsole.source !== null,
                label: ` ${WALDIEZ_STRINGS.CLEAR_LOGS}`,
                icon: clearIcon
            });
        }
        if (!this._commands.hasCommand(this._toggleConsoleViewCommandId)) {
            this._commands.addCommand(this._toggleConsoleViewCommandId, {
                execute: this.toggle.bind(this)
            });
        }
        return logConsoleWidget;
    }
    /**
     * Log an IOPub message to the log console.
     * @param msg The IOPub message
     * @private
     * @memberof WaldiezLogger
     */
    private _logIOPub(msg: IStreamMsg): void {
        const content = msg.content;
        if (content.name === 'stdout' || content.name === 'stderr') {
            let level: LogLevel = 'info';
            const data = content.text;
            const dataLower = data.toLowerCase();
            if (content.name === 'stderr') {
                if (
                    dataLower.includes('warning') &&
                    (!dataLower.includes('error') ||
                        dataLower.includes('exception'))
                ) {
                    // some warnings (for example about tqdm) are sent to stderr
                    level = 'warning';
                }
            }
            const payload: ILogPayload = {
                data,
                level,
                type: 'text'
            };
            this._logData(payload);
        }
    }
    /**
     * Log an input request message to the log console.
     * @param msg The input request message
     * @private
     * @memberof WaldiezLogger
     */
    private _logStdin(msg: IInputRequestMsg): void {
        const content = msg.content;
        const payload: ILogPayload = {
            data: content.prompt,
            level: 'warning',
            type: 'text'
        };
        this._logData(payload);
    }
    /**
     * Log an execute reply message to the log console.
     * @param msg The execute reply message
     * @private
     * @memberof WaldiezLogger
     */
    private _logReply(msg: IExecuteReplyMsg): void {
        const content = msg.content;
        const payload: ILogPayload = {
            data: content.status,
            level: 'info',
            type: 'text'
        };
        this._logData(payload);
    }
    /**
     * Log an execute request message to the log console.
     * @param msg The execute request message
     * @private
     * @memberof WaldiezLogger
     */
    private _logExecuteRequest(msg: IExecuteRequestMsg): void {
        const content = msg.content;
        const payload: ILogPayload = {
            data: content.code,
            level: 'info',
            type: 'text'
        };
        this._logData(payload);
    }
    private _logData(payload: ILogPayload): void {
        this._getLogger().log(payload);
    }
    private _getLogger(): ILogger {
        return this._loggerRegistry.getLogger(`Waldiez-${this._id}`);
    }
}

/**
 * A namespace for WaldiezLogger statics.
 * @namespace WaldiezLogger
 * @memberof WaldiezLogger
 */
export namespace WaldiezLogger {
    export interface IOptions {
        commands: CommandRegistry;
        editorId: string;
        panel: SplitPanel;
        rendermime: IRenderMimeRegistry;
    }
}
