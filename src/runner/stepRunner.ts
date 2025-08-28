/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "../logger";
import { WaldiezBaseRunner } from "./baseRunner";
import { normalizeLogEntry, parseRequestId, strip_ansi } from "./common";
import { Kernel } from "@jupyterlab/services";
import { IInputRequestMsg } from "@jupyterlab/services/lib/kernel/messages";

import {
    WaldiezChatMessageProcessingResult,
    WaldiezChatMessageProcessor,
    WaldiezStepByStep,
    WaldiezStepByStepProcessingResult,
    WaldiezStepByStepProcessor,
} from "@waldiez/react";

const CONTROL_PROMPT = "[Step] (c)ontinue, (r)un, (q)uit, (i)nfo, (h)elp, (st)ats: ";
const END_MARKER = "<Waldiez> - Done running the flow.";

export class WaldiezStepRunner extends WaldiezBaseRunner<Partial<WaldiezStepByStep>> {
    private _eventHistory: Set<Record<string, any>>;
    private _currentEvent: Record<string, any> | undefined;
    constructor({ logger, onStdin, baseUrl, onUpdate, onEnd }: WaldiezStepRunner.IOptions) {
        super({
            logger,
            onStdin,
            baseUrl,
            onUpdate,
            onEnd,
        });
        this._eventHistory = new Set();
        this._currentEvent = undefined;
    }

    /**
     * Get the request ID.
     * @public
     * @memberof WaldiezStepRunner
     */
    get requestId() {
        return this._requestId;
    }

    /**
     * Start a step-by-step session.
     * @public
     * @param kernel The kernel to run the code
     * @param filePath The path of the waldiez file
     * @memberof WaldiezStepRunner
     */
    start(kernel: Kernel.IKernelConnection, filePath: string) {
        this.executeFile(kernel, filePath, "debug");
    }

    responded() {
        this._expectingUserInput = false;
        this._onUpdate({
            pendingControlInput: undefined,
            activeRequest: undefined,
        });
    }

    /**
     * Reset the runner's state.
     * @public
     * @memberof WaldiezStepRunner
     */
    reset() {
        super.reset();
        this._eventHistory = new Set();
        this._currentEvent = undefined;
    }

    /**
     * Handle stdin messages.
     * @public
     * @memberof WaldiezStepRunner
     */
    onStdin(msg: IInputRequestMsg) {
        this._expectingUserInput = true;
        if (msg.content.prompt === CONTROL_PROMPT) {
            this._onUpdate({
                active: this._running,
                pendingControlInput: {
                    request_id: this.requestId || "<unknown>",
                    prompt: msg.content.prompt,
                },
            });
        } else {
            this._onUpdate({
                active: this._running,
                pendingControlInput: undefined,
                activeRequest: {
                    request_id: this.requestId || "<unknown>",
                    prompt: msg.content.prompt,
                    password: msg.content.password || false,
                },
            });
        }
        msg.metadata = {
            request_id: this._requestId,
        };
        this._inputRequest = msg;
        this._onStdin(msg);
    }

    /**
     * Process a message using the WaldiezMessageProcessor.
     * @param stdMessage The raw message to process
     * @protected
     * @memberof WaldiezStepRunner
     */
    protected processMessage(stdMessage: string) {
        let rawMessage = stdMessage;
        if (rawMessage.endsWith("\n")) {
            rawMessage = rawMessage.slice(0, -1);
        }
        rawMessage = strip_ansi(rawMessage);
        if (rawMessage.includes(END_MARKER)) {
            this._onUpdate({ active: false });
            return;
        }
        const requestId = parseRequestId(rawMessage);
        if (requestId) {
            this._requestId = requestId;
            return;
        }
        let result = WaldiezStepByStepProcessor.process(rawMessage);
        if (result?.error) {
            result = this._handleStepProcessError(rawMessage, result);
        }
        if (!result) {
            return;
        }
        if (result.error) {
            const normalized = normalizeLogEntry(rawMessage);
            for (const line of normalized) {
                const message = {
                    type: "raw",
                    content: line,
                };
                this._eventHistory.add(message);
            }
        }
        if (result.stateUpdate?.eventHistory) {
            const lastEvent = result.stateUpdate.eventHistory[result.stateUpdate.eventHistory.length - 1];
            this._eventHistory = new Set([...this._eventHistory, ...result.stateUpdate.eventHistory]);
            this._currentEvent = typeof lastEvent === "object" ? lastEvent : undefined;
        }
        if (!result.stateUpdate && result.debugMessage) {
            this._eventHistory.add(result.debugMessage);
        }
        this._onUpdate({
            active: !result.error && this.running,
            eventHistory: Array.from(this._eventHistory).reverse(),
            currentEvent: typeof this._currentEvent?.type === "string" ? this._currentEvent : undefined,
            lastError: result.error ? result.error.message : undefined,
        });
    }

    private _handleStepProcessError(rawMessage: string, result: WaldiezStepByStepProcessingResult) {
        if (!result.error) {
            return result;
        }
        let newResult: WaldiezStepByStepProcessingResult | undefined = {
            error: result.error,
        };
        let chatResult: WaldiezChatMessageProcessingResult | undefined = undefined;
        try {
            const parsed = JSON.parse(rawMessage);
            if (parsed.type === "error") {
                return {
                    error: {
                        message: parsed.message,
                        originalData: rawMessage,
                    },
                };
            }
            if (
                parsed.type === "print" &&
                typeof parsed.data === "object" &&
                parsed.data &&
                "type" in parsed.data
            ) {
                newResult = WaldiezStepByStepProcessor.process(parsed.data);
            } else {
                newResult = WaldiezStepByStepProcessor.process(parsed);
            }
            if (newResult?.error) {
                chatResult = WaldiezChatMessageProcessor.process(rawMessage);
                if (!chatResult) {
                    return newResult;
                } else {
                    return this._chatResultToStepResult(chatResult);
                }
            } else {
                return newResult;
            }
        } catch (e) {
            return {
                error: {
                    message: (e as Error).message,
                    originalData: rawMessage,
                },
            };
        }
    }

    private _chatResultToStepResult(
        chatResult: WaldiezChatMessageProcessingResult,
    ): WaldiezStepByStepProcessingResult | undefined {
        if (chatResult.participants) {
            // Handle participants
        }
        if (!chatResult.message || !chatResult.message.content) {
            return undefined;
        }
        return {
            stateUpdate: {
                eventHistory: [chatResult],
            },
        };
    }
}

/**
 * The namespace for the WaldiezStandardRunner class.
 * It contains the IOptions interface.
 */
export namespace WaldiezStepRunner {
    export interface IOptions {
        baseUrl: string;
        logger: WaldiezLogger;
        onStdin: (msg: IInputRequestMsg) => void;
        onUpdate: (update: Partial<WaldiezStepByStep>) => void;
        onEnd: () => void;
    }
}
