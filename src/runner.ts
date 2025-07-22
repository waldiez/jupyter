/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "./logger";
// import { WaldiezMessageProcessor } from "./messageProcessor";
import { URLExt } from "@jupyterlab/coreutils";
import { Kernel } from "@jupyterlab/services";
import {
    IErrorMsg,
    IExecuteReplyMsg,
    IExecuteRequestMsg,
    IInputRequestMsg,
    IStreamMsg,
} from "@jupyterlab/services/lib/kernel/messages";

import { WaldiezChatMessage, WaldiezChatMessageProcessor, WaldiezTimelineData } from "@waldiez/react";

export const getCodeToExecute = (filePath: string) => {
    return (
        "from pathlib import Path\n" +
        "from waldiez import WaldiezRunner\n" +
        `file_path = Path(r"${filePath}").as_posix()\n` +
        'uploads_root = Path(file_path).parent / "uploads"\n' +
        "runner = WaldiezRunner.load(waldiez_file=file_path)\n" +
        "runner.run(uploads_root=uploads_root, structured_io=True)\n"
    );
};

/**
 * Get the uploads root directory.
 * @param filePath The path of the waldiez file
 * @returns The uploads root directory
 */
const getUploadsRoot = (filePath: string): string => {
    // Determine separator based on path
    const separator = filePath.includes("\\") ? "\\" : "/";

    // Get the directory name
    const lastSeparatorIndex = filePath.lastIndexOf(separator);
    const dirPath = lastSeparatorIndex !== -1 ? filePath.substring(0, lastSeparatorIndex) : ".";

    // Join with uploads directory
    return dirPath + separator + "uploads";
};

/**
 * The runner class to run a waldiez file through a kernel.
 * It listens for stdin and iopub messages.
 * It also logs the messages.
 * @param logger The logger to use for logging
 * @param onStdin The function to call when an stdin request is received
 */
export class WaldiezRunner {
    private _running: boolean = false;
    private _future?: Kernel.IShellFuture<IExecuteRequestMsg, IExecuteReplyMsg>;
    private _onStdin: (msg: IInputRequestMsg) => void;
    private _logger: WaldiezLogger;
    private _baseUrl: string;
    private _messages: WaldiezChatMessage[] = [];
    private _timelineData: WaldiezTimelineData | undefined = undefined;
    private _userParticipants: string[] = [];
    private _onInputRequest: (requestId: string) => void;
    private _onMessagesUpdate: (isInputRequest: boolean) => void;
    private _onTimelineData?: (data: WaldiezTimelineData) => void;
    private _onEnd: () => void;
    private _requestId: string | null = null;
    private _expectingUserInput: boolean = false;
    private _uploadsRoot: string | null = null;

    constructor({
        logger,
        onStdin,
        baseUrl,
        onInputRequest,
        onMessagesUpdate,
        onTimelineData,
        onEnd,
    }: WaldiezRunner.IOptions) {
        this._logger = logger;
        this._onStdin = onStdin;
        this._baseUrl = baseUrl;
        this._onMessagesUpdate = onMessagesUpdate;
        this._onTimelineData = onTimelineData;
        this._onInputRequest = onInputRequest;
        this._onEnd = onEnd;
    }

    /**
     * Get whether a waldiez file is running.
     * @returns Whether a waldiez file is running
     * @public
     * @readonly
     * @type {boolean}
     * @memberof WaldiezRunner
     */
    get running() {
        return this._running;
    }

    /**
     * Run a waldiez file.
     * When the code is sent for execution, we listen for stdin and iopub messages.
     * @param kernel The kernel to run the code
     * @param filePath The path of the waldiez file
     * @public
     * @memberof WaldiezRunner
     */
    run(kernel: Kernel.IKernelConnection, filePath: string) {
        if (this._running) {
            console.warn("A waldiez file is already running");
            return;
        }
        this._running = true;
        this._messages = [];
        this._userParticipants = [];
        this._requestId = null;
        this._expectingUserInput = false;
        this._future = undefined;
        this._timelineData = undefined;
        this._uploadsRoot = getUploadsRoot(filePath);

        const code = getCodeToExecute(filePath);
        this._future = kernel.requestExecute(
            {
                code,
                stop_on_error: true,
            },
            false,
        );
        this._onFuture();
    }

    /**
     * Reset the runner's state.
     * @public
     * @memberof WaldiezRunner
     */
    reset() {
        this._running = false;
        this._requestId = null;
        this._expectingUserInput = false;
        if (this._future) {
            this._future.dispose();
            this._future = undefined;
        }
    }

    /**
     * Get previous messages to pass with the input prompt.
     * @returns The previous messages
     * @public
     * @memberof WaldiezRunner
     */
    getPreviousMessages() {
        return this._messages;
    }

    /**
     * Get the names of the participants that are marked
     *  as 'users' (i.e. have replied to the input request).
     * returns The names of the participants
     * @public
     * @memberof WaldiezRunner
     */
    getUserParticipants() {
        return this._userParticipants;
    }

    /**
     * Get the timeline data.
     * @returns The timeline data
     * @public
     * @memberof WaldiezRunner
     */
    getTimelineData(): WaldiezTimelineData | undefined {
        return this._timelineData;
    }

    /**
     * Set the timeline data.
     * @param data The timeline data to set
     * @public
     * @memberof WaldiezRunner
     */
    setTimelineData(data: WaldiezTimelineData | undefined) {
        this._timelineData = data;
        if (!data) {
            return;
        }
        // Notify about the timeline data
        this._onTimelineData?.(data);
    }
    /**
     * Listen for stdin, iopub and reply messages.
     * @private
     * @memberof WaldiezRunner
     */
    private _onFuture() {
        if (!this._future) {
            console.error("Failed to create a future for the waldiez file");
            this.reset();
            return;
        }

        this._future.onStdin = msg => {
            const requestMsg = msg as IInputRequestMsg;
            requestMsg.metadata = {
                request_id: this._requestId,
            };
            this._onStdin(requestMsg);
            this._expectingUserInput = true;
        };

        this._future.onIOPub = msg => {
            const msgType = msg.header.msg_type;
            if (msgType === "stream") {
                const streamMsg = msg as IStreamMsg;
                if (streamMsg.content.name === "stdout") {
                    this._processMessage(streamMsg.content.text);
                }
                this._logger.log(streamMsg);
            } else if (msgType === "error") {
                this._logger.log(msg as IErrorMsg);
                this._running = false;
            }
        };

        this._future.onReply = msg => {
            if (msg.content.status !== "ok") {
                this._logger.log(`error: ${msg}`);
            }
        };

        this._future.done.catch(err => {
            console.error("Error while running the waldiez file", err);
            if (!err) {
                err = {
                    channel: "iopub",
                    content: {
                        name: "stderr",
                        text: "Failed to run the waldiez file",
                    },
                    header: { msg_type: "stream" },
                    metadata: {},
                };
            }
            const errorMsg = typeof err === "string" ? err : JSON.stringify(err);
            this._logger.log(`Error: ${errorMsg}`);
            this._running = false;
            this._onEnd();
        });
    }

    /**
     * Process a message using the WaldiezMessageProcessor.
     * @param rawMessage The raw message to process
     * @private
     * @memberof WaldiezRunner
     */
    private _processMessage(rawMessage: string) {
        const isDone = this._workflow_is_done(rawMessage);
        if (isDone) {
            this._running = false;
            this._onEnd();
        }
        // Check if the runner is running
        if (!this._running) {
            return;
        }
        const newImgurl = this._requestId
            ? URLExt.join(this._baseUrl, "waldiez", "files") +
              `?view=${this._uploadsRoot}/${this._requestId}.png`
            : undefined;
        const result = WaldiezChatMessageProcessor.process(rawMessage, this._requestId, newImgurl);
        // If the result is undefined, it means the message was not processed
        if (!result) {
            return;
        }
        if (result.timeline) {
            // Notify about the timeline data
            this.setTimelineData(result.timeline);
            this._expectingUserInput = false;
            return;
        }
        // Check if this is a text message after an input request
        if (
            this._expectingUserInput &&
            result.message &&
            result.message.type === "text" &&
            result.message.sender
        ) {
            this._expectingUserInput = false;
        }
        // Update request ID if needed
        if (result.message && result.message.type === "input_request" && result.requestId) {
            this._requestId = result.requestId;
            this._onInputRequest(result.requestId);
            this._expectingUserInput = true;
        }

        if (result.message && result.message.content) {
            // Add message to the list
            this._messages.push(result.message);
            // Notify about the new message
            this._onMessagesUpdate(this._expectingUserInput);
        }
        const endMessage = this._raw_has_ending(rawMessage);
        if (endMessage) {
            // If the raw message has an ending, add it to the messages
            this._messages.push(endMessage);
            // Notify about the new message
            this._expectingUserInput = false;
            this._onMessagesUpdate(false);
            result.isWorkflowEnd = true; // Mark as workflow end
        }
        // Handle workflow end
        if (result.isWorkflowEnd && this._timelineData !== undefined) {
            this._running = false;
            this._onEnd();
            this._logger.log("Workflow finished");
        }
        if (result.participants && result.participants.users.length > 0) {
            // Update user participants
            this._userParticipants = Array.from(
                new Set([...this._userParticipants, ...result.participants.users]),
            );
        }
    }
    private _workflow_is_done(rawMessage: string): WaldiezChatMessage | null {
        // Check if the raw message indicates that the flow has finished running
        if (rawMessage.includes("<Waldiez> - Done running the flow.")) {
            const message: WaldiezChatMessage = {
                type: "system",
                id: "flow-done",
                timestamp: new Date().toISOString(),
                content: [
                    {
                        type: "text",
                        text: "<Waldiez> - Done running the flow.",
                    },
                ],
            };
            return message;
        }
        return null;
    }
    // "<Waldiez> - Done running the flow."
    /**
     * Check if the raw message has an ending.
     * @param rawMessage The raw message to check
     * @returns Whether the raw message has an ending
     * @private
     * @memberof WaldiezRunner
     */
    private _raw_has_ending(rawMessage: string): WaldiezChatMessage | null {
        // <Waldiez> - Workflow finished
        // <Waldiez> - Workflow stopped by user
        // <Waldiez> - Workflow execution failed:
        if (rawMessage.includes("<Waldiez> - Workflow ")) {
            let parsedMessage: string = "Workflow finished";
            try {
                const parsedMessageObject = JSON.parse(rawMessage);
                if (
                    typeof parsedMessageObject === "object" &&
                    parsedMessageObject &&
                    "data" in parsedMessageObject &&
                    typeof parsedMessageObject.data === "string"
                ) {
                    parsedMessage = parsedMessageObject.data.replace("<Waldiez> - ", "").replace("\n", "");
                }
            } catch (_) {
                parsedMessage = rawMessage.replace("<Waldiez> - ", "").replace("\n", "");
            }
            const message: WaldiezChatMessage = {
                type: "system",
                id: "workflow-end",
                timestamp: new Date().toISOString(),
                content: [
                    {
                        type: "text",
                        text: parsedMessage,
                    },
                ],
            };
            return message;
        }
        return null;
    }
}

/**
 * The namespace for the WaldiezRunner class.
 * It contains the IOptions interface.
 */
export namespace WaldiezRunner {
    export interface IOptions {
        baseUrl: string;
        logger: WaldiezLogger;
        onStdin: (msg: IInputRequestMsg) => void;
        onInputRequest: (requestId: string) => void;
        onMessagesUpdate: (isInputRequest: boolean) => void;
        onTimelineData?: (data: WaldiezTimelineData) => void;
        onEnd: () => void;
    }
}
