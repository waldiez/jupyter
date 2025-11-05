/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { CommandIDs } from "./commands";
import { WALDIEZ_STRINGS } from "./constants";
import { copyToClipboard, strip_ansi } from "./runner/common";
import { MainAreaWidget } from "@jupyterlab/apputils";
import {
    type ILogPayload,
    type ILogger,
    LogConsolePanel,
    type LogLevel,
    LoggerRegistry,
} from "@jupyterlab/logconsole";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import type {
    IErrorMsg,
    IExecuteReplyMsg,
    IExecuteRequestMsg,
    IInputRequestMsg,
    IStreamMsg,
} from "@jupyterlab/services/lib/kernel/messages";
import {
    CommandToolbarButton,
    clearIcon,
    consoleIcon,
    copyIcon,
    downloadIcon,
} from "@jupyterlab/ui-components";
import { CommandRegistry } from "@lumino/commands";
import { SplitPanel } from "@lumino/widgets";

type LogEntry = { timestamp: string; data: string };

/**
 * A logger for the Waldiez extension.
 * It logs messages to the log console.
 * It also provides a button to toggle the log console view.
 * @param options The logger options
 */
export class WaldiezLogger {
    private readonly _commands: CommandRegistry;
    private readonly _id: string;
    private _panel: SplitPanel;
    private readonly _rendermime: IRenderMimeRegistry;
    private readonly _loggerRegistry: LoggerRegistry;
    private readonly _logConsole: LogConsolePanel;
    private readonly _widget: MainAreaWidget<LogConsolePanel>;
    private readonly _toggleConsoleViewButton: CommandToolbarButton;
    private readonly _copyLogsButton: CommandToolbarButton;
    private readonly _clearLogsButton: CommandToolbarButton;
    private readonly _downloadLogsButton: CommandToolbarButton;
    private _widgetIsVisible: boolean;
    private readonly _toggleConsoleViewCommandId: string;
    private readonly _logConsoleClearCommandId: string;
    private readonly _copyLogsCommandId: string;
    private readonly _clearLogsCommandId: string;
    private readonly _downloadLogsCommandId: string;

    constructor(options: WaldiezLogger.IOptions) {
        this._id = options.editorId;
        this._commands = options.commands;
        this._rendermime = options.rendermime;
        this._logConsoleClearCommandId = `${CommandIDs.clearLogs}-${this._id}`;
        this._toggleConsoleViewCommandId = `${CommandIDs.toggleLogsView}-${this._id}`;
        this._copyLogsCommandId = `${CommandIDs.copyLogs}-${this._id}`;
        this._clearLogsCommandId = `${CommandIDs.clearLogs}-${this._id}`;
        this._downloadLogsCommandId = `${CommandIDs.downloadLogs}-${this._id}`;
        this._loggerRegistry = new LoggerRegistry({
            defaultRendermime: this._rendermime,
            maxLength: 2000,
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
                /* istanbul ignore next */
                this._widgetIsVisible ? ` ${WALDIEZ_STRINGS.HIDE_LOGS}` : ` ${WALDIEZ_STRINGS.SHOW_LOGS}`,
        });
        this._copyLogsButton = new CommandToolbarButton({
            commands: this._commands,
            id: this._copyLogsCommandId,
            icon: copyIcon,
            label: ` ${WALDIEZ_STRINGS.COPY_LOGS} `,
        });
        this._clearLogsButton = new CommandToolbarButton({
            commands: this._commands,
            id: this._clearLogsCommandId,
            icon: clearIcon,
            label: ` ${WALDIEZ_STRINGS.CLEAR_LOGS} `,
        });
        this._downloadLogsButton = new CommandToolbarButton({
            commands: this._commands,
            id: this._downloadLogsCommandId,
            icon: downloadIcon,
            label: ` ${WALDIEZ_STRINGS.DOWNLOAD_LOGS} `,
        });
        // the split panel to contain the log console
        this._panel = options.panel;
        this._widget = this._getLogWidget();
        this._getLogger().level = "info";
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
    // noinspection JSUnusedGlobalSymbols
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
     * @param level The log level (if msg is a string)
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
            | string,
        level?: LogLevel,
    ): void {
        if (typeof msg === "string") {
            this._logData({
                data: msg,
                level: level || "info",
                type: "text",
            });
            return;
        }
        if ("level" in msg) {
            this._logData(msg);
        } else {
            /* istanbul ignore next */
            if (typeof msg === "object") {
                // if the message is not a Jupyter message, log it as a string
                /* istanbul ignore if */
                if (!msg || !("header" in msg)) {
                    this._logData({
                        data: JSON.stringify(msg),
                        level: level || "info",
                        type: "text",
                    });
                    return;
                }
            }
            if (msg.header.msg_type === "error") {
                this._logData({
                    data: (msg as IErrorMsg).content.ename,
                    level: "error",
                    type: "text",
                });
                this._logData({
                    data: (msg as IErrorMsg).content.evalue,
                    level: "error",
                    type: "text",
                });
                this._logData({
                    data: (msg as IErrorMsg).content.traceback.join("\n"),
                    level: "error",
                    type: "text",
                });
            } else {
                if (msg.header.msg_type === "stream") {
                    this._logIOPub(msg as IStreamMsg);
                } else if (msg.header.msg_type === "input_request") {
                    this._logStdin(msg as IInputRequestMsg);
                } else if (msg.header.msg_type === "execute_reply") {
                    this._logReply(msg as IExecuteReplyMsg);
                } else if (msg.header.msg_type === "execute_request") {
                    this._logExecuteRequest(msg as IExecuteRequestMsg);
                }
            }
        }
        this._scrollToBottom();
    }
    /**
     * Log a warning message.
     * @param message The warning message to log
     * @public
     * @memberof WaldiezLogger
     */
    warning(message: string): void {
        this._logData({
            data: message,
            level: "warning",
            type: "text",
        });
    }
    /**
     * Log an error message.
     * @param message The error message to log
     * @public
     * @memberof WaldiezLogger
     */
    error(message: string): void {
        this._logData({
            data: message,
            level: "error",
            type: "text",
        });
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
            this._logConsoleClearCommandId,
            this._clearLogsCommandId,
            this._copyLogsCommandId,
            this._downloadLogsCommandId,
        ]) {
            /* istanbul ignore if */
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
        const logs = this._logConsole.node.querySelectorAll(".jp-OutputArea-child");
        if (!logs) {
            // too early?, try again
            /* istanbul ignore if */
            if (retry < 5) {
                setTimeout(() => this._scrollToBottom(retry + 1), 1000);
                return;
            }
            /* istanbul ignore next */
            return;
        }
        const lastLog = logs[logs.length - 1];
        if (lastLog) {
            /* istanbul ignore next */
            lastLog.scrollIntoView();
        }
    }

    private _collectLogEntries(): LogEntry[] {
        const logs = this._logConsole.node.querySelectorAll(".jp-OutputArea-child");
        const logEntries: { timestamp: string; data: string }[] = [];

        logs.forEach(entry => {
            const text = entry.textContent || "";
            // try to extract timestamp and data
            const timestampMatch = text.match(/^\s*(\d{1,2}:\d{2}:\d{2}(?:\s*[AP]M)?)\s*(.*)/);

            if (timestampMatch && timestampMatch[2].trim()) {
                const timestamp = timestampMatch[1].trim();
                const data = timestampMatch[2].trim();
                logEntries.push({
                    timestamp,
                    data: strip_ansi(data),
                });
            } else {
                logEntries.push({
                    timestamp: new Date().toISOString(),
                    data: strip_ansi(text.trim()),
                });
            }
        });

        return logEntries;
    }

    private _entriesToJsonl(entries: LogEntry[]): string {
        // JSON Lines (ndjson); trailing newline plays nice with many tools
        return entries.map(e => JSON.stringify(e)).join("\n") + "\n";
    }

    private _makeDownloadFilename(prefix = "waldiez-logs", ext = "jsonl"): string {
        const pad = (n: number) => String(n).padStart(2, "0");
        const d = new Date();
        return (
            `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
            `-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.${ext}`
        );
    }

    /**
     * Copy logs to clipboard
     * @public
     * @memberof WaldiezLogger
     */
    private async _copyLogs(): Promise<void> {
        const jsonl = this._entriesToJsonl(this._collectLogEntries());
        await copyToClipboard(jsonl);
    }

    /**
     * Download logs
     * @public
     * @memberof WaldiezLogger
     */
    private async _downloadLogs(): Promise<void> {
        const jsonl = this._entriesToJsonl(this._collectLogEntries());
        const blob = new Blob([jsonl], { type: "application/x-ndjson;charset=utf-8" });
        const filename = this._makeDownloadFilename();

        const navAny = navigator as any;
        if (typeof navAny?.msSaveOrOpenBlob === "function") {
            navAny.msSaveOrOpenBlob(blob, filename);
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    /**
     * Get the log console widget.
     * @returns The log console widget
     * @private
     * @memberof WaldiezLogger
     */
    private _getLogWidget(): MainAreaWidget<LogConsolePanel> {
        const logConsoleWidget = new MainAreaWidget<LogConsolePanel>({
            content: this._logConsole,
        });
        logConsoleWidget.toolbar.addItem("clear", this._clearLogsButton);
        logConsoleWidget.toolbar.addItem("copy", this._copyLogsButton);
        logConsoleWidget.toolbar.addItem("download", this._downloadLogsButton);
        this._setupCommands();
        return logConsoleWidget;
    }

    private _setupCommands(): void {
        this._setupClearCommand();
        this._setupCopyCommand();
        this._setupToggleCommand();
        this._setupDownloadCommand();
    }
    private _setupClearCommand(): void {
        if (!this._commands.hasCommand(this._logConsoleClearCommandId)) {
            /* istanbul ignore next */
            this._commands.addCommand(this._logConsoleClearCommandId, {
                execute: () => this._getLogger().clear(),
                isEnabled: () => !!this._logConsole && this._logConsole.source !== null,
                label: ` ${WALDIEZ_STRINGS.CLEAR_LOGS}`,
                icon: clearIcon,
            });
        }
    }
    private _setupCopyCommand(): void {
        if (!this._commands.hasCommand(this._copyLogsCommandId)) {
            this._commands.addCommand(this._copyLogsCommandId, {
                execute: this._copyLogs.bind(this),
                isEnabled: () => !!this._logConsole && this._logConsole.source !== null,
                label: ` ${WALDIEZ_STRINGS.COPY_LOGS}`,
                icon: copyIcon,
            });
        }
    }

    private _setupDownloadCommand(): void {
        if (!this._commands.hasCommand(this._downloadLogsCommandId)) {
            this._commands.addCommand(this._downloadLogsCommandId, {
                execute: this._downloadLogs.bind(this),
                isEnabled: () => !!this._logConsole && this._logConsole.source !== null,
                label: ` ${WALDIEZ_STRINGS.DOWNLOAD_LOGS}`,
                icon: downloadIcon,
            });
        }
    }

    private _setupToggleCommand(): void {
        if (!this._commands.hasCommand(this._toggleConsoleViewCommandId)) {
            this._commands.addCommand(this._toggleConsoleViewCommandId, {
                execute: this.toggle.bind(this),
            });
        }
    }

    /**
     * Log an IOPub message to the log console.
     * @param msg The IOPub message
     * @private
     * @memberof WaldiezLogger
     */
    private _logIOPub(msg: IStreamMsg): void {
        const content = msg.content;
        if (content.name === "stdout" || content.name === "stderr") {
            let level: LogLevel = "info";
            const data = content.text;
            const dataLower = data.toLowerCase();
            if (content.name === "stderr") {
                if (
                    dataLower.includes("warning") &&
                    (!dataLower.includes("error") || dataLower.includes("exception"))
                ) {
                    // some warnings (for example about tqdm) are sent to stderr
                    level = "warning";
                }
            }
            const payload: ILogPayload = {
                data,
                level,
                type: "text",
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
            level: "warning",
            type: "text",
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
            level: "info",
            type: "text",
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
            level: "info",
            type: "text",
        };
        this._logData(payload);
    }
    private _logData(payload: ILogPayload): void {
        payload.data =
            typeof payload.data === "string"
                ? strip_ansi(payload.data)
                : strip_ansi(JSON.stringify(payload.data));
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
