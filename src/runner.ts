/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "./logger";
import { URLExt } from "@jupyterlab/coreutils";
import { Kernel } from "@jupyterlab/services";
import {
    IErrorMsg,
    IExecuteReplyMsg,
    IExecuteRequestMsg,
    IInputRequestMsg,
    IStreamMsg,
} from "@jupyterlab/services/lib/kernel/messages";

import { WaldiezChatMessage } from "@waldiez/react";

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
    private _requestId: string | null = null;
    private _expectingUserInput: boolean = false;
    private _uploadsRoot: string | null = null;

    constructor({ logger, onStdin, baseUrl, onInputRequest }: WaldiezRunner.IOptions) {
        this._logger = logger;
        this._onStdin = onStdin;
        this._baseUrl = baseUrl;
        this._onInputRequest = onInputRequest;
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
    }

    /**
     * Get previous messages to pass with the input prompt.
     * @param inputPrompt The input prompt
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
     * Remove ANSI escape sequences from a string.
     * @param str The string to remove ANSI escape sequences from
     * @returns The string without ANSI escape sequences
     * @private
     * @memberof WaldiezRunner
     */
    private _remove_ansi(str: string): string {
        // eslint-disable-next-line no-control-regex
        return str.replace(/\u001b\[[0-9;]*m/g, "");
    }
    /**
     * Check if the message is an input request.
     * @param msg The message to check
     * @returns The request id if the message is an input request, false otherwise
     * @private
     * @memberof WaldiezRunner
     */
    private _isInputRequest(raw_content: string): string | false {
        const regex =
            /{.*?"type"\s*:\s*"input_request".*?"request_id"\s*:\s*"(.*?)".*?}|{.*?"request_id"\s*:\s*"(.*?)".*?"type"\s*:\s*"input_request".*?}/s;
        const match = raw_content.match(regex);
        if (match) {
            const requestId = match[1] || match[2];
            return requestId;
        }
        return false;
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
        };
        this._future.onIOPub = msg => {
            const msgType = msg.header.msg_type;
            if (msgType === "stream") {
                const streamMsg = msg as IStreamMsg;
                if (streamMsg.content.name === "stdout") {
                    const requestId = this._isInputRequest(streamMsg.content.text);
                    if (requestId) {
                        this._requestId = requestId;
                        this._onInputRequest(requestId);
                    }
                    this._addMessageIfNeeded(streamMsg);
                }
                this._logger.log(streamMsg);
            } else if (msgType === "error") {
                this._logger.log(msg as IErrorMsg);
            }
        };
        this._future.onReply = msg => {
            // this._messages.push(msg.content.status);
            // this._logger.log(msg);
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
     * Replace image URLs in the content with the correct path.
     * @param content The content to replace
     * @param uploadsRoot The root path of the uploads
     * @param requestId The request id
     * @returns The content with the replaced URLs
     * @private
     * @memberof WaldiezRunner
     */
    private _replaceImageUrls(content: any[], uploadsRoot: string | null, requestId: string): any[] {
        if (!uploadsRoot) {
            console.error("Uploads root is not set");
            return content;
        }
        const newUrl =
            URLExt.join(this._baseUrl, "waldiez", "files") + `?view=${uploadsRoot}/${requestId}.png`;
        return content.map(item => {
            if (item.type === "image_url" && item.image_url.url) {
                return {
                    ...item,
                    image_url: {
                        ...item.image_url,
                        url: newUrl,
                    },
                };
            }
            return item;
        });
    }
    /**
     * Add a message to the list of messages if it is not already present.
     * @param msg The message to add
     * @private
     * @memberof WaldiezRunner
     */
    private _addMessageIfNeeded(msg: IStreamMsg) {
        const message = this._remove_ansi(msg.content.text);
        let messageObject: Record<string, any> | null = null;
        try {
            messageObject = JSON.parse(message);
        } catch (_) {
            // Ignore JSON parse error (we might spam with pre-start prints)
        }
        if (!messageObject) {
            // console.error("No message:", message);
            return;
        }
        switch (messageObject?.type) {
            case "input_request": {
                this._expectingUserInput = true;
                this._requestId = messageObject.request_id;
                let prompt = messageObject.prompt;
                if (prompt === ">" || prompt === "> ") {
                    prompt = "Enter your message to start the conversation:";
                }
                const chatMessage: WaldiezChatMessage = {
                    id: messageObject.request_id,
                    timestamp: new Date().toISOString(),
                    request_id: this._requestId || messageObject.request_id,
                    type: "input_request",
                    content: [
                        {
                            type: "text",
                            text: prompt,
                        },
                    ],
                };
                this._messages.push(chatMessage);
                break;
            }
            case "text":
                if (
                    messageObject.content &&
                    messageObject.content?.content &&
                    messageObject.content?.sender &&
                    messageObject.content?.recipient
                ) {
                    if (this._expectingUserInput) {
                        if (typeof messageObject.content.sender === "string") {
                            if (!this._userParticipants.includes(messageObject.content.sender)) {
                                this._userParticipants.push(messageObject.content.sender);
                            }
                        }
                        this._expectingUserInput = false;
                    }
                    const messageId =
                        messageObject?.id || messageObject.content.content.uuid || new Date().toISOString();
                    const messageTimestamp = messageObject?.timestamp || new Date().toISOString();
                    const messageType = messageObject?.type || "text";
                    const sender = messageObject?.content?.sender;
                    const recipient = messageObject?.content?.recipient;
                    if (typeof messageObject.content.content === "string") {
                        const message: WaldiezChatMessage = {
                            id: messageId,
                            timestamp: messageTimestamp,
                            type: messageType,
                            content: [
                                {
                                    type: "text",
                                    text: messageObject.content.content,
                                },
                            ],
                            sender,
                            recipient,
                        };
                        this._messages.push(message);
                    } else if (Array.isArray(messageObject.content.content)) {
                        let content = messageObject.content.content;
                        if (this._requestId) {
                            content = this._replaceImageUrls(
                                messageObject.content.content,
                                this._uploadsRoot,
                                this._requestId,
                            );
                        }
                        const message: WaldiezChatMessage = {
                            id: messageId,
                            timestamp: messageTimestamp,
                            type: messageType,
                            content,
                            sender,
                            recipient,
                        };
                        this._messages.push(message);
                    } else if (typeof messageObject.content.content === "object") {
                        let content = [messageObject.content.content];
                        if (this._requestId) {
                            content = this._replaceImageUrls(content, this._uploadsRoot, this._requestId);
                        }
                        const message: WaldiezChatMessage = {
                            id: messageId,
                            timestamp: messageTimestamp,
                            type: "text",
                            content,
                            sender,
                            recipient,
                        };
                        this._messages.push(message);
                    }
                    if (this._requestId) {
                        this._requestId = null;
                    }
                }
                break;
            default:
                // console.error("Unknown message type", messageObject.type);
                // console.error("Message content", messageObject);
                break;
            // TODO: test tools, other agents and add other types
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
    }
}
