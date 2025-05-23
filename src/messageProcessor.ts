/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { URLExt } from "@jupyterlab/coreutils";
import { nanoid } from "nanoid";

import { WaldiezChatMessage } from "@waldiez/react";

/**
 * Process messages for Waldiez Runner
 */
export class WaldiezMessageProcessor {
    /**
     * Process a raw message and return the result
     * @param rawMessage The raw message to process
     * @param options Options for processing
     * @returns The result of processing or undefined
     */
    public static process(
        rawMessage: string,
        options: {
            uploadsRoot: string | null;
            baseUrl: string;
            requestId: string | null;
        },
    ):
        | {
              message?: WaldiezChatMessage;
              requestId?: string | null;
              isWorkflowEnd?: boolean;
          }
        | undefined {
        // Remove ANSI escape sequences
        const message = WaldiezMessageProcessor._removeAnsi(rawMessage);

        // Parse JSON data
        let data: Record<string, any> | null = null;
        try {
            data = JSON.parse(message);
        } catch (_) {
            // Ignore JSON parse error (we might spam with pre-start prints)
            return undefined;
        }

        if (!data) {
            return undefined;
        }

        switch (data?.type) {
            case "input_request": {
                return WaldiezMessageProcessor._handleInputRequest(data, options.requestId);
            }
            case "print":
                return WaldiezMessageProcessor._checkEnd(data);
            case "text":
            case "tool_call":
                return WaldiezMessageProcessor._handleTextMessage(data, options);
            case "termination":
                return WaldiezMessageProcessor._handleTermination(data);
            case "group_chat_run_chat":
                return WaldiezMessageProcessor._handleGroupChatRun(data);
            case "generate_code_execution_reply":
                return WaldiezMessageProcessor._handleGenerateCodeExecutionReply(data);
            case "select_speaker":
            case "select_speaker_invalid_input":
                return WaldiezMessageProcessor._handleSpeakerSelection(data);
            default:
                // Ignore unknown message types
                return undefined;
        }
    }

    /**
     * Remove ANSI escape sequences from a string.
     * @param str The string to remove ANSI escape sequences from
     * @returns The string without ANSI escape sequences
     * @private
     */
    private static _removeAnsi(str: string): string {
        // eslint-disable-next-line no-control-regex
        return str.replace(/\u001b\[[0-9;]*m/g, "");
    }

    /**
     * Check if the message is an end message.
     * @param data The message object to check
     * @private
     */
    private static _checkEnd(data: any): { isWorkflowEnd: boolean } | undefined {
        if (
            data.content &&
            typeof data.content === "object" &&
            data.content !== null &&
            "data" in data.content &&
            typeof data.content.data === "string"
        ) {
            const dataContent = data.content.data;
            if (dataContent.includes("<Waldiez> - Workflow finished")) {
                return { isWorkflowEnd: true };
            }
        }
        return undefined;
    }

    /**
     * Handle an input request message.
     * @param data The message object to handle
     * @param currentRequestId The current request ID
     * @private
     */
    private static _handleInputRequest(
        data: any,
        currentRequestId: string | null,
    ): {
        message: WaldiezChatMessage;
        requestId: string;
    } {
        let prompt = data.prompt;
        if (prompt === ">" || prompt === "> ") {
            prompt = "Enter your message to start the conversation:";
        }

        const chatMessage: WaldiezChatMessage = {
            id: data.request_id,
            timestamp: new Date().toISOString(),
            request_id: currentRequestId || data.request_id,
            type: "input_request",
            content: [
                {
                    type: "text",
                    text: prompt,
                },
            ],
        };

        return {
            message: chatMessage,
            requestId: data.request_id,
        };
    }

    /**
     * Handle a termination message.
     * @param data The message object to handle
     * @private
     */
    private static _handleTermination(data: any):
        | {
              message: WaldiezChatMessage;
          }
        | undefined {
        if (
            data.content &&
            typeof data.content === "object" &&
            data.content !== null &&
            "termination_reason" in data.content &&
            typeof data.content.termination_reason === "string"
        ) {
            const terminationMessage: WaldiezChatMessage = {
                id: nanoid(),
                timestamp: new Date().toISOString(),
                type: "system",
                content: [
                    {
                        type: "text",
                        text: data.content.termination_reason,
                    },
                ],
            };

            return {
                message: terminationMessage,
            };
        }

        return undefined;
    }

    /**
     * Handle a text message.
     * @param data The message object to handle
     * @param options The processing options
     * @private
     */
    private static _handleTextMessage(
        data: any,
        options: {
            uploadsRoot: string | null;
            baseUrl: string;
            requestId: string | null;
        },
    ):
        | {
              message: WaldiezChatMessage;
              requestId: string | null;
          }
        | undefined {
        if (data.content && data.content?.content && data.content?.sender && data.content?.recipient) {
            const messageId = data?.id || data.content.content.uuid || nanoid();
            const messageTimestamp = data?.timestamp || new Date().toISOString();
            const messageType = data?.type || "text";
            const sender = data?.content?.sender;
            const recipient = data?.content?.recipient;
            let message: WaldiezChatMessage | undefined;

            if (typeof data.content.content === "string") {
                message = {
                    id: messageId,
                    timestamp: messageTimestamp,
                    type: "text",
                    content: [
                        {
                            type: "text",
                            text: data.content.content,
                        },
                    ],
                    sender,
                    recipient,
                };
            } else if (Array.isArray(data.content.content)) {
                let content = data.content.content;
                if (options.requestId) {
                    content = WaldiezMessageProcessor._replaceImageUrls(
                        data.content.content,
                        options.uploadsRoot,
                        options.baseUrl,
                        options.requestId,
                    );
                }
                message = {
                    id: messageId,
                    timestamp: messageTimestamp,
                    type: messageType,
                    content,
                    sender,
                    recipient,
                };
            } else if (typeof data.content.content === "object") {
                let content = [data.content.content];
                if (options.requestId) {
                    content = WaldiezMessageProcessor._replaceImageUrls(
                        content,
                        options.uploadsRoot,
                        options.baseUrl,
                        options.requestId,
                    );
                }

                message = {
                    id: messageId,
                    timestamp: messageTimestamp,
                    type: "text",
                    content,
                    sender,
                    recipient,
                };
            }

            if (message) {
                return {
                    message,
                    requestId: null, // Clear request ID after use
                };
            }
        }
        return undefined;
    }

    /**
     * Process a group chat run message
     * @param data The message data
     * @returns The processed message or undefined
     * @private
     */
    private static _handleGroupChatRun(data: any):
        | {
              message: WaldiezChatMessage;
          }
        | undefined {
        if (
            data.content &&
            typeof data.content === "object" &&
            data.content !== null &&
            "uuid" in data.content &&
            typeof data.content.uuid === "string" &&
            "speaker" in data.content &&
            typeof data.content.speaker === "string"
        ) {
            const chatMessage: WaldiezChatMessage = {
                id: data.content.uuid,
                timestamp: new Date().toISOString(),
                type: "system",
                content: [
                    {
                        type: "text",
                        text: "Group chat run",
                    },
                ],
                sender: data.content.speaker,
            };

            return { message: chatMessage };
        }

        return undefined;
    }

    /**
     * Process a speaker selection message
     * @param data The message data
     * @returns The processed message or undefined
     * @private
     */
    private static _handleSpeakerSelection(data: any):
        | {
              message: WaldiezChatMessage;
          }
        | undefined {
        if (
            data.content &&
            typeof data.content === "object" &&
            data.content !== null &&
            "uuid" in data.content &&
            typeof data.content.uuid === "string" &&
            "agents" in data.content &&
            Array.isArray(data.content.agents) &&
            data.content.agents.every((agent: unknown) => typeof agent === "string")
        ) {
            const chatMessage: WaldiezChatMessage = {
                id: data.content.uuid,
                timestamp: new Date().toISOString(),
                type: "system",
                content: [
                    {
                        type: "text",
                        text: this._generateSpeakerSelectionMd(data.content.agents),
                    },
                ],
            };
            return { message: chatMessage };
        }
        return undefined;
    }

    /**
     * Generate a markdown string for speaker selection
     * @param agents The list of agents
     * @returns The generated markdown string
     * @private
     */
    private static _generateSpeakerSelectionMd(agents: string[]): string {
        return `## Select a speaker\n\nPlease select a speaker from the following list:\n\n${agents
            .map((agent, index) => `- [${index + 1}] ${agent}`)
            .join("\n")}\n\n**Note:** You can select a speaker by entering the corresponding number.`;
    }

    /**
     * Process a code execution reply message
     * @param data The message data
     * @returns The processed message or undefined
     * @private
     */
    private static _handleGenerateCodeExecutionReply(data: any):
        | {
              message: WaldiezChatMessage;
          }
        | undefined {
        if (
            data.content &&
            typeof data.content === "object" &&
            data.content !== null &&
            "uuid" in data.content &&
            typeof data.content.uuid === "string" &&
            "sender" in data.content &&
            typeof data.content.sender === "string" &&
            "recipient" in data.content &&
            typeof data.content.recipient === "string"
        ) {
            const chatMessage: WaldiezChatMessage = {
                id: nanoid(),
                timestamp: new Date().toISOString(),
                type: "system",
                content: [
                    {
                        type: "text",
                        text: "Generate code execution reply",
                    },
                ],
                sender: data.content.sender,
                recipient: data.content.recipient,
            };

            return { message: chatMessage };
        }

        return undefined;
    }

    /**
     * Replace image URLs in content
     * @param content The content to process
     * @param uploadsRoot The uploads root directory
     * @param baseUrl The base URL
     * @param requestId The request ID
     * @returns The processed content
     * @private
     */
    private static _replaceImageUrls(
        content: any[],
        uploadsRoot: string | null,
        baseUrl: string,
        requestId: string,
    ): any[] {
        if (!uploadsRoot) {
            console.error("Uploads root is not set");
            return content;
        }

        const newUrl = URLExt.join(baseUrl, "waldiez", "files") + `?view=${uploadsRoot}/${requestId}.png`;

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
}
