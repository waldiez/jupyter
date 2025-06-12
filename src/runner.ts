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

import { WaldiezChatMessage, WaldiezChatMessageProcessor } from "@waldiez/react";

export const getCodeToExecute = (filePath: string) => {
    return (
        "from pathlib import Path\n" +
        "from autogen.io import IOStream\n" +
        "from waldiez import WaldiezRunner\n" +
        "from waldiez.io import StructuredIOStream\n\n" +
        `file_path = Path(r"${filePath}").as_posix()\n` +
        'uploads_root = Path(file_path).parent / "uploads"\n' +
        "stream = StructuredIOStream(uploads_root=uploads_root)\n" +
        "with IOStream.set_default(stream):\n" +
        "    runner = WaldiezRunner.load(waldiez_file=file_path)\n" +
        "    runner.run(uploads_root=uploads_root)\n"
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
    private _userParticipants: string[] = [];
    private _onInputRequest: (requestId: string) => void;
    private _onMessagesUpdate: (isInputRequest: boolean) => void;
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
        onEnd,
    }: WaldiezRunner.IOptions) {
        this._logger = logger;
        this._onStdin = onStdin;
        this._baseUrl = baseUrl;
        this._onMessagesUpdate = onMessagesUpdate;
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
        this._future = undefined;
        this._messages = [];
        this._userParticipants = [];
        this._requestId = null;
        this._expectingUserInput = false;
        this._onMessagesUpdate(false);
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

    // /**
    //  * Check if the message is an input request.
    //  * @param msg The message to check
    //  * @returns The request id if the message is an input request, false otherwise
    //  * @private
    //  * @memberof WaldiezRunner
    //  */
    // private _isInputRequest(raw_content: string): string | false {
    //     const regex =
    //         /{.*?"type"\s*:\s*"input_request".*?"request_id"\s*:\s*"(.*?)".*?}|{.*?"request_id"\s*:\s*"(.*?)".*?"type"\s*:\s*"input_request".*?}/s;
    //     const match = raw_content.match(regex);
    //     if (match) {
    //         const requestId = match[1] || match[2];
    //         return requestId;
    //     }
    //     return false;
    // }

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
                    // const requestId = this._isInputRequest(streamMsg.content.text);
                    // if (requestId) {
                    //     this._requestId = requestId;
                    //     this._onInputRequest(requestId);
                    //     this._expectingUserInput = true;
                    // }
                    this._processMessage(streamMsg.content.text);
                }
                this._logger.log(streamMsg);
            } else if (msgType === "error") {
                this._logger.log(msg as IErrorMsg);
            }
        };

        this._future.onReply = msg => {
            if (msg.content.status !== "ok") {
                this._logger.log(`error: ${msg}`);
            }
        };

        this._future.done
            .catch(err => {
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
                this._logger.log(err as IStreamMsg);
            })
            .finally(() => {
                this.reset();
            });
    }

    /**
     * Process a message using the WaldiezMessageProcessor.
     * @param rawMessage The raw message to process
     * @private
     * @memberof WaldiezRunner
     */
    private _processMessage(rawMessage: string) {
        // Check if the runner is running
        if (!this._running) {
            return;
        }
        const newImgurl = this._requestId
            ? URLExt.join(this._baseUrl, "waldiez", "files") +
              `?view=${this._uploadsRoot}/${this._requestId}.png`
            : undefined;
        const result = WaldiezChatMessageProcessor.process(rawMessage, this._requestId, newImgurl);

        if (!result) {
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
        if (result.requestId) {
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

        // Handle workflow end
        if (result.isWorkflowEnd) {
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
        onEnd: () => void;
    }
}

/*
[Log] Processing message: (lib_index_js.8eda56c74fdbf787ff2d.js, line 1977)
"{\"id\": \"7bd2c3e5-1e47-4754-8b37-1a2193eacd14\", \"type\": \"input_request\", \"timestamp\": \"2025-06-12T12:15:03.361291\", \"request_id\": \"c6f3f84577dc4a6b9147c66e1ae280f8\", \"prompt\": \"Replying as user_proxy. Provide feedback to chat_manager. Press enter to skip and use auto-reply, or type 'exit' to end the conversation: \", \"password\": false}

[Log] Processed result: (lib_index_js.8eda56c74fdbf787ff2d.js, line 1986)
Object

message: {id: "c6f3f84577dc4a6b9147c66e1ae280f8", timestamp: "2025-06-12T12:15:03.361291", request_id: "c6f3f84577dc4a6b9147c66e1ae280f8", type: "input_request", content: [{type: "text", text: "Replying as user_proxy. Provide feedback to chat_m…o-reply, or type 'exit' to end the conversation: "}], …}

requestId: "c6f3f84577dc4a6b9147c66e1ae280f8"

Object Prototype


[Log] Processing message: (lib_index_js.8eda56c74fdbf787ff2d.js, line 1977)
"{\"type\": \"termination\", \"content\": {\"uuid\": \"f43aecc4-0bc9-4200-b237-1e309212a47b\", \"termination_reason\": \"No reply generated\"}}
"

[Log] Processed result: (lib_index_js.8eda56c74fdbf787ff2d.js, line 1986)
Object

message: {id: "o3aK64OYASm5w1F42WNMT", timestamp: "2025-06-12T09:15:14.430Z", type: "system", content: [{type: "text", text: "No reply generated"}]}

Object Prototype

"
*/
