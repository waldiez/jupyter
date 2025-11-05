/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { CommandIDs } from "../commands";
import { WALDIEZ_STRINGS } from "../constants";
import { WaldiezLogger } from "../logger";
import type { ISessionContext } from "@jupyterlab/apputils";
import { Kernel } from "@jupyterlab/services";
import { CommandToolbarButton, kernelIcon } from "@jupyterlab/ui-components";
import { CommandRegistry } from "@lumino/commands";

import { showSnackbar } from "@waldiez/react";

/**
 * Manages kernel operations and state for the Waldiez editor.
 */
export class WaldiezKernelManager {
    private readonly _commands: CommandRegistry;
    private _logger: WaldiezLogger;
    private readonly _editorId: string;
    private _sessionContext: ISessionContext;
    private readonly _restartKernelCommandId: string;
    private readonly _interruptKernelCommandId: string;
    private readonly _restartKernelButton: CommandToolbarButton;
    private readonly _interruptKernelButton: CommandToolbarButton;

    constructor(
        commands: CommandRegistry,
        logger: WaldiezLogger,
        editorId: string,
        sessionContext: ISessionContext,
    ) {
        this._commands = commands;
        this._logger = logger;
        this._editorId = editorId;
        this._sessionContext = sessionContext;

        this._restartKernelCommandId = `${CommandIDs.restartKernel}-${editorId}`;
        this._interruptKernelCommandId = `${CommandIDs.interruptKernel}-${editorId}`;

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
        this._initializeCommands();

        // Listen to kernel status changes
        this._sessionContext.statusChanged.connect(this._onSessionStatusChanged, this);
    }

    get restartButton(): CommandToolbarButton {
        return this._restartKernelButton;
    }

    get interruptButton(): CommandToolbarButton {
        return this._interruptKernelButton;
    }

    get kernel(): Kernel.IKernelConnection | null {
        return this._sessionContext.session?.kernel || null;
    }

    private _initializeCommands(): void {
        /* istanbul ignore next */
        if (!this._commands.hasCommand(this._restartKernelCommandId)) {
            this._commands.addCommand(this._restartKernelCommandId, {
                execute: this.restart.bind(this),
                label: ` ${WALDIEZ_STRINGS.RESTART_KERNEL}`,
            });
        }
        if (!this._commands.hasCommand(this._interruptKernelCommandId)) {
            this._commands.addCommand(this._interruptKernelCommandId, {
                execute: this.interrupt.bind(this),
                label: ` ${WALDIEZ_STRINGS.INTERRUPT_KERNEL}`,
            });
        }
    }

    async restart(): Promise<void> {
        const session = this._sessionContext.session;
        if (session?.kernel) {
            try {
                await session.kernel.restart();
                showSnackbar({
                    flowId: this._editorId,
                    message: WALDIEZ_STRINGS.KERNEL_RESTARTED,
                    level: "info",
                });
                this._logger.log({
                    data: WALDIEZ_STRINGS.KERNEL_RESTARTED,
                    level: "info",
                    type: "text",
                });
            } catch (err) {
                const errorMsg = `Error restarting kernel: ${err}`;
                showSnackbar({
                    flowId: this._editorId,
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

    async interrupt(): Promise<void> {
        const session = this._sessionContext.session;
        if (session?.kernel) {
            try {
                await session.kernel.interrupt();
                showSnackbar({
                    flowId: this._editorId,
                    message: WALDIEZ_STRINGS.KERNEL_INTERRUPTED,
                    level: "info",
                });
            } catch (err) {
                const errorMsg = `Error interrupting kernel: ${err}`;
                showSnackbar({
                    flowId: this._editorId,
                    message: errorMsg,
                    level: "error",
                });
            }
        }
    }

    private _onSessionStatusChanged(_context: ISessionContext, status: Kernel.Status): void {
        this._logger.log({
            data: WALDIEZ_STRINGS.KERNEL_STATUS_CHANGED(status),
            level: "debug",
            type: "text",
        });
    }

    dispose(): void {
        this._restartKernelButton.dispose();
        /* istanbul ignore next */
        if (this._commands.hasCommand(this._restartKernelCommandId)) {
            this._commands.notifyCommandChanged(this._restartKernelCommandId);
        }
        /* istanbul ignore next */
        this._interruptKernelButton.dispose();
        if (this._commands.hasCommand(this._interruptKernelCommandId)) {
            this._commands.notifyCommandChanged(this._interruptKernelCommandId);
        }
    }
}
