/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "../logger";
import { getCodeToExecute, getUploadsRoot } from "./common";
import { Kernel } from "@jupyterlab/services";
import type {
    IErrorMsg,
    IExecuteReplyMsg,
    IExecuteRequestMsg,
    IInputRequestMsg,
    IStreamMsg,
} from "@jupyterlab/services/lib/kernel/messages";

/**
 * Base runner class for executing waldiez files through a kernel.
 * Provides common functionality for kernel execution, message handling, and state management.
 */
export abstract class WaldiezBaseRunner<TUpdate = any> {
    protected _running: boolean = false;
    protected _future?: Kernel.IShellFuture<IExecuteRequestMsg, IExecuteReplyMsg>;
    protected readonly _onStdin: (msg: IInputRequestMsg) => void;
    protected _logger: WaldiezLogger;
    protected readonly _baseUrl: string;
    protected readonly _onUpdate: (update: TUpdate) => void;
    protected readonly _onEnd: () => void;
    protected _inputRequest: IInputRequestMsg | null = null;
    protected _requestId: string | null = null;
    protected _expectingUserInput: boolean = false;
    protected _uploadsRoot: string | null = null;

    constructor({ logger, onStdin, baseUrl, onUpdate, onEnd }: WaldiezBaseRunner.IOptions<TUpdate>) {
        this._logger = logger;
        this._onStdin = onStdin;
        this._baseUrl = baseUrl;
        this._onUpdate = onUpdate;
        this._onEnd = onEnd;
    }

    /**
     * Get whether a waldiez file is running.
     * @returns Whether a waldiez file is running
     * @public
     * @readonly
     * @type {boolean}
     */
    get running() {
        return this._running;
    }

    /**
     * Get the current request ID.
     * @returns The request ID
     * @public
     * @readonly
     * @type {string | null}
     */
    get requestId() {
        return this._requestId;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Get the current input request.
     * @returns The input request
     * @public
     * @readonly
     * @type {IInputRequestMsg | null}
     */
    get inputRequest() {
        return this._inputRequest;
    }

    /**
     * Reset the runner's state.
     * @public
     */
    reset() {
        this._running = false;
        this._requestId = null;
        this._inputRequest = null;
        this._expectingUserInput = false;
        if (this._future) {
            this._future.dispose();
            this._future = undefined;
        }
    }

    /**
     * Execute a waldiez file with the given execution mode.
     * @param kernel The kernel to run the code
     * @param filePath The path of the waldiez file
     * @param executionMode The execution mode ('standard' or 'debug')
     * @param breakpoints Initial breakpoints for 'debug' mode.
     * @protected
     */
    protected executeFile(
        kernel: Kernel.IKernelConnection,
        filePath: string,
        executionMode: "standard" | "debug",
        breakpoints?: string[],
        checkpoint?: string | null,
    ) {
        if (this._running) {
            this._logger.error("A waldiez flow is already running");
            return;
        }
        this._inputRequest = null;
        this._running = true;
        this._requestId = null;
        this._expectingUserInput = false;
        this._future = undefined;
        this._uploadsRoot = getUploadsRoot(filePath);

        const code = getCodeToExecute(filePath, executionMode, breakpoints, checkpoint);
        this._future = kernel.requestExecute(
            {
                code,
                stop_on_error: true,
            },
            true,
        );
        this._onFuture();
    }

    /**
     * Listen for stdin, iopub and reply messages.
     * @private
     */
    private _onFuture() {
        if (!this._future) {
            this._logger.error("Failed to create a future for the waldiez file");
            this.reset();
            return;
        }

        this._future.onStdin = msg => {
            this.onStdin(msg as IInputRequestMsg);
        };

        this._future.onIOPub = msg => {
            const msgType = msg.header.msg_type;
            if (msgType === "stream") {
                const streamMsg = msg as IStreamMsg;
                this._logger.log(streamMsg);
                if (streamMsg.content.name === "stdout") {
                    this.processMessage(streamMsg.content.text);
                }
            } else if (msgType === "error") {
                this._logger.log(msg as IErrorMsg);
                this._running = false;
            }
        };

        this._future.onReply = msg => {
            if (msg.content.status !== "ok") {
                this._logger.error(`error: ${msg.content}`);
            }
        };

        this._future.done.catch(err => {
            if (this._running && err.message) {
                this._logger.error(err.message);
            }
            this.reset();
            this._onEnd();
        });
    }

    /**
     * Process a message from the kernel output.
     * This method should be implemented by subclasses to handle specific message processing logic.
     * @param rawMessage The raw message to process
     * @protected
     * @abstract
     */
    protected abstract processMessage(rawMessage: string): void;

    protected abstract onStdin(msg: IInputRequestMsg): void;
}

/**
 * The namespace for the WaldiezBaseRunner class.
 */
export namespace WaldiezBaseRunner {
    export interface IOptions<TUpdate = any> {
        baseUrl: string;
        logger: WaldiezLogger;
        onStdin: (msg: IInputRequestMsg) => void;
        onUpdate: (update: TUpdate) => void;
        onEnd: () => void;
    }
}
