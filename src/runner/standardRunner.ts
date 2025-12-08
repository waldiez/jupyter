/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "../logger";
import { WaldiezBaseRunner } from "./baseRunner";
import { URLExt } from "@jupyterlab/coreutils";
import { Kernel } from "@jupyterlab/services";
import type { IInputRequestMsg } from "@jupyterlab/services/lib/kernel/messages";

import {
    type WaldiezChatConfig,
    type WaldiezChatMessage,
    WaldiezChatMessageProcessor,
    type WaldiezTimelineData,
} from "@waldiez/react";

/**
 * The runner class to run a waldiez file through a kernel.
 * It listens for stdin and iopub messages.
 */
export class WaldiezStandardRunner extends WaldiezBaseRunner<Partial<WaldiezChatConfig>> {
    private _messages: WaldiezChatMessage[] = [];
    private _timelineData: WaldiezTimelineData | undefined = undefined;
    private _userParticipants: string[] = [];
    readonly _onUpdate: (updateData: Partial<WaldiezChatConfig>) => void;

    constructor({ logger, onStdin, baseUrl, onUpdate, onEnd }: WaldiezStandardRunner.IOptions) {
        super({
            logger,
            onStdin,
            baseUrl,
            onUpdate,
            onEnd,
        });
        this._onUpdate = onUpdate;
    }

    /**
     * Run a waldiez file.
     * When the code is sent for execution, we listen for stdin and iopub messages.
     * @param kernel The kernel to run the code
     * @param filePath The path of the waldiez file
     * @public
     * @memberof WaldiezStandardRunner
     */
    run(kernel: Kernel.IKernelConnection, filePath: string) {
        this.reset(true);
        this.executeFile(kernel, filePath, "standard");
    }

    /**
     * Reset the runner's state.
     * @public
     * @memberof WaldiezStandardRunner
     */
    reset(clearTimeline: boolean = false) {
        super.reset();
        this._messages = [];
        this._userParticipants = [];
        if (clearTimeline) {
            this.setTimelineData(undefined);
        }
    }

    /**
     * Get previous messages to pass with the input prompt.
     * @returns The previous messages
     * @public
     * @memberof WaldiezStandardRunner
     */
    getPreviousMessages() {
        return this._messages;
    }

    /**
     * Get the names of the participants that are marked
     *  as 'users' (i.e. have replied to the input request).
     * returns The names of the participants
     * @public
     * @memberof WaldiezStandardRunner
     */
    getUserParticipants() {
        return this._userParticipants;
    }

    /**
     * Get the timeline data.
     * @returns The timeline data
     * @public
     * @memberof WaldiezStandardRunner
     */
    getTimelineData(): WaldiezTimelineData | undefined {
        return this._timelineData;
    }

    /**
     * Set the timeline data.
     * @param data The timeline data to set
     * @public
     * @memberof WaldiezStandardRunner
     */
    setTimelineData(data: WaldiezTimelineData | undefined) {
        this._timelineData = data;
        /* istanbul ignore if */
        if (!data) {
            return;
        }
        const update: Partial<WaldiezChatConfig> = {
            timeline: data,
            messages: this._messages,
            userParticipants: this._userParticipants,
            activeRequest: undefined,
        };
        this._onUpdate(update);
    }

    /**
     * Handle stdin messages.
     * @param msg The stdin message
     * @protected
     * @memberof WaldiezStandardRunner
     */
    protected onStdin(msg: IInputRequestMsg): void {
        const requestMsg = msg as IInputRequestMsg;
        this._inputRequest = requestMsg;
        requestMsg.metadata = {
            request_id: this._requestId,
        };
        this._expectingUserInput = true;
        this._onStdin(requestMsg);
    }

    /**
     * Process a message using the WaldiezMessageProcessor.
     * @param rawMessage The raw message to process
     * @protected
     * @memberof WaldiezStandardRunner
     */
    protected processMessage(rawMessage: string) {
        // const isDone = this._workflow_is_done(rawMessage);
        // if (isDone) {
        //     this._running = false;
        //     this._onEnd();
        // }
        // Check if the runner is running
        if (!this._running) {
            return;
        }
        const newImgUrl = this._requestId
            ? URLExt.join(this._baseUrl, "waldiez", "files") +
              `?view=${this._uploadsRoot}/${this._requestId}.png`
            : undefined;
        let result;
        try {
            result = WaldiezChatMessageProcessor.process(rawMessage, this._requestId, newImgUrl);
        } catch {
            //
        }
        // If the result is undefined, it means the message was not processed
        if (!result) {
            const endMessage = this._raw_has_ending(rawMessage);
            /* istanbul ignore if */
            if (endMessage) {
                this._messages.push(endMessage);
                this._running = false;
                this._onEnd();
            }
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
        if (result.participants && result.participants.length > 0) {
            // Update user participants
            this._timelineData = undefined;
            this._userParticipants = Array.from(
                new Set([
                    ...this._userParticipants,
                    ...result.participants
                        .filter(p => p.isUser)
                        .map(p => p.name)
                        .filter(Boolean),
                ]),
            );
            this._onUpdate({
                userParticipants: this._userParticipants,
                timeline: undefined,
                activeRequest: undefined,
            });
        }
        // Update request ID if needed
        if (result.message && result.message.type === "input_request" && result.requestId) {
            this._requestId = result.requestId;
            this._expectingUserInput = true;
        }

        if (result.message && result.message.content) {
            // Add message to the list
            this._messages.push(result.message);
            if (!this._expectingUserInput) {
                this._onUpdate({ messages: this._messages, activeRequest: undefined });
            } else {
                this._onUpdate({ messages: this._messages });
            }
        }
        const endMessage = this._raw_has_ending(rawMessage);
        if (endMessage) {
            // If the raw message has an ending, add it to the messages
            this._messages.push(endMessage);
            // Notify about the new message
            this._expectingUserInput = false;
            result.isWorkflowEnd = true; // Mark as workflow end
            // Notify about the new message
            this._onUpdate({ messages: this._messages, activeRequest: undefined });
        }
    }
    // private _workflow_is_done(rawMessage: string): WaldiezChatMessage | null {
    //     // Check if the raw message indicates that the flow has finished running
    //     if (rawMessage.includes("<Waldiez> - Done running the flow.")) {
    //         return {
    //             type: "system",
    //             id: "flow-done",
    //             timestamp: new Date().toISOString(),
    //             content: [
    //                 {
    //                     type: "text",
    //                     text: "<Waldiez> - Done running the flow.",
    //                 },
    //             ],
    //         };
    //     }
    //     return null;
    // }
    /**
     * Check if the raw message has an ending.
     * @param rawMessage The raw message to check
     * @returns Whether the raw message has an ending
     * @private
     * @memberof WaldiezStandardRunner
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
            return {
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
        }
        return null;
    }
}

/**
 * The namespace for the WaldiezStandardRunner class.
 * It contains the IOptions interface.
 */
export namespace WaldiezStandardRunner {
    export interface IOptions {
        baseUrl: string;
        logger: WaldiezLogger;
        onStdin: (msg: IInputRequestMsg) => void;
        onUpdate: (updateData: Partial<WaldiezChatConfig>) => void;
        onEnd: () => void;
    }
}
