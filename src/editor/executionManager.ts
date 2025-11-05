/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WALDIEZ_STRINGS } from "../constants";
import { WaldiezLogger } from "../logger";
import { afterInterrupt, getWaldiezActualPath } from "../rest";
import { WaldiezStandardRunner, WaldiezStepRunner } from "../runner";
import { WaldiezKernelManager } from "./kernelManager";
import type { IEditorState, IExecutionContext } from "./types";
import type { ISessionContext } from "@jupyterlab/apputils";
import type { IInputRequestMsg } from "@jupyterlab/services/lib/kernel/messages";
import { Signal } from "@lumino/signaling";

import type {
    WaldiezBreakpoint,
    WaldiezChatConfig,
    WaldiezChatHandlers,
    WaldiezChatMessage,
    WaldiezChatUserInput,
    WaldiezDebugInputResponse,
    WaldiezStepByStep,
    WaldiezStepHandlers,
} from "@waldiez/react";

/**
 * Manages execution state and runner coordination.
 */
export class WaldiezExecutionManager {
    private _standardRunner: WaldiezStandardRunner;
    private _stepRunner: WaldiezStepRunner;
    private _state: IEditorState;
    private readonly _logger: WaldiezLogger;
    private _signal: Signal<
        any,
        { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }
    >;

    private _sessionContext: ISessionContext | null = null;
    private _kernelManager: WaldiezKernelManager | null = null;

    constructor(
        logger: WaldiezLogger,
        baseUrl: string,
        signal: Signal<
            any,
            { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }
        >,
    ) {
        this._logger = logger;
        this._signal = signal;

        // Initialize runners
        this._standardRunner = new WaldiezStandardRunner({
            logger: this._logger,
            baseUrl,
            onStdin: this._onChatStdin.bind(this),
            onUpdate: this._onChatUpdate.bind(this),
            onEnd: this._onEnd.bind(this),
        });

        this._stepRunner = new WaldiezStepRunner({
            logger: this._logger,
            baseUrl,
            onStdin: this._onStepStdin.bind(this),
            onUpdate: this._onStepUpdate.bind(this),
            onEnd: this._onEnd.bind(this),
        });

        const chatHandlers: WaldiezChatHandlers = {
            onUserInput: this._createUserInputHandler(),
            onInterrupt: this._createInterruptHandler(),
            onClose: this._createCloseHandler(),
        };

        const stepByStepHandlers: WaldiezStepHandlers = {
            sendControl: this._createSendControlHandler(),
            close: this.closeStepByStepSession.bind(this),
            respond: this._createStepByStepRespondHandler(),
        };

        this._state = {
            chat: {
                show: false,
                active: false,
                messages: [] as WaldiezChatMessage[],
                timeline: undefined,
                userParticipants: [],
                handlers: chatHandlers,
            },
            stepByStep: {
                show: false,
                active: false,
                stepMode: true,
                autoContinue: false,
                breakpoints: [],
                eventHistory: [],
                currentEvent: undefined,
                timeline: undefined,
                participants: [],
                help: undefined,
                lastError: undefined,
                pendingControlInput: null,
                activeRequest: null,
                handlers: stepByStepHandlers,
            },
            stdinRequest: null,
        };
    }

    _resetStepByStepState() {
        this._state.stepByStep = {
            ...this._state.stepByStep,
            active: false,
            stepMode: true,
            autoContinue: false,
            breakpoints: [],
            eventHistory: [],
            currentEvent: undefined,
            timeline: undefined,
            participants: [],
            help: undefined,
            lastError: undefined,
            pendingControlInput: null,
            activeRequest: null,
        };
    }

    /**
     * Set the dependencies that handlers need access to.
     * This should be called after the manager is created.
     */
    setDependencies(sessionContext: ISessionContext, kernelManager: WaldiezKernelManager): void {
        this._sessionContext = sessionContext;
        this._kernelManager = kernelManager;
    }

    // Handler factory methods that capture dependencies
    private _createUserInputHandler() {
        return (userInput: WaldiezChatUserInput) => {
            if (!this._sessionContext) {
                console.error("SessionContext not available for user input");
                return;
            }
            /* istanbul ignore next */
            this.handleUserInput(userInput, this._sessionContext);
        };
    }

    private _createInterruptHandler() {
        return () => {
            if (!this._kernelManager) {
                console.error("KernelManager not available for interrupt");
                return;
            }
            /* istanbul ignore next */
            this.handleInterrupt(this._kernelManager);
        };
    }

    private _createCloseHandler() {
        return () => {
            /* istanbul ignore next */
            if (!this._kernelManager) {
                console.error("KernelManager not available for close");
                return;
            }
            /* istanbul ignore next */
            this.handleClose();
        };
    }

    private _createSendControlHandler() {
        return (input: Pick<WaldiezDebugInputResponse, "data" | "request_id">) => {
            /* istanbul ignore next */
            if (!this._sessionContext) {
                console.error("SessionContext not available for send control");
                return;
            }
            /* istanbul ignore next */
            this.sendControl(input, this._sessionContext);
        };
    }

    private _createStepByStepRespondHandler() {
        return (response: WaldiezChatUserInput) => {
            if (!this._sessionContext) {
                console.error("SessionContext not available for step response");
                return;
            }
            this.stepByStepRespond(response, this._sessionContext);
        };
    }

    // Standard execution methods
    async executeStandard(context: IExecutionContext): Promise<void> {
        if (!context.kernel) {
            throw new Error(WALDIEZ_STRINGS.NO_KERNEL);
        }

        this._signal.emit({ chat: undefined, stepByStep: undefined });

        try {
            const actualPath = await getWaldiezActualPath(context.filePath);
            this._standardRunner.run(context.kernel, actualPath);
        } catch (err) {
            this._logger.log({
                data: String(err),
                level: "error",
                type: "text",
            });
            throw err;
        }
    }

    // Step-by-step execution methods
    async executeStepByStep(
        context: IExecutionContext,
        breakpoints?: (string | WaldiezBreakpoint)[],
        checkpoint?: string | null,
    ): Promise<void> {
        if (!context.kernel) {
            throw new Error(WALDIEZ_STRINGS.NO_KERNEL);
        }

        this._signal.emit({ chat: undefined, stepByStep: undefined });

        try {
            const actualPath = await getWaldiezActualPath(context.filePath);
            this._stepRunner.start(context.kernel, actualPath, breakpoints, checkpoint);
        } catch (err) {
            /* istanbul ignore next */
            this._logger.log({
                data: (err as Error).message || String(err),
                level: "error",
                type: "text",
            });
            throw err;
        }
    }

    // Input handling methods
    handleUserInput(userInput: WaldiezChatUserInput, sessionContext: ISessionContext): void {
        if (this._state.stdinRequest) {
            this._logger.log({
                data: JSON.stringify(userInput),
                level: "info",
                type: "text",
            });
            sessionContext.session?.kernel?.sendInputReply(
                { value: JSON.stringify(userInput), status: "ok" },
                this._state.stdinRequest.parent_header as any,
            );
            this._state.stdinRequest = null;
        }
    }

    handleInterrupt(kernelManager: WaldiezKernelManager): void {
        this._state.stdinRequest = null;
        this._standardRunner.reset();
        this._standardRunner.setTimelineData(undefined);
        this._signal.emit({
            chat: {
                show: false,
                active: false,
                messages: this._standardRunner.getPreviousMessages(),
                timeline: undefined,
                userParticipants: this._standardRunner.getUserParticipants(),
                activeRequest: undefined,
            },
            stepByStep: undefined,
        });
        try {
            // noinspection JSIgnoredPromiseFromCall
            kernelManager.restart();
            afterInterrupt();
        } catch {
            //
        }
    }

    handleClose(): void {
        this._state.stdinRequest = null;
        this._standardRunner.reset(true);
        this._signal.emit({
            chat: undefined,
            stepByStep: undefined,
        });
        try {
            if (this._kernelManager) {
                // noinspection JSIgnoredPromiseFromCall
                this._kernelManager.restart();
                afterInterrupt();
            }
        } catch {
            //
        }
    }

    sendControl(
        input: Pick<WaldiezDebugInputResponse, "data" | "request_id">,
        sessionContext: ISessionContext,
    ): void {
        if (this._state.stdinRequest) {
            input.request_id = this._stepRunner.requestId || input.request_id || "<unknown>";
            sessionContext.session?.kernel?.sendInputReply(
                { value: JSON.stringify({ ...input, type: "debug_input_response" }), status: "ok" },
                this._state.stdinRequest.parent_header as any,
            );
        } else {
            console.error("StepByStep response received without stdin request");
        }
        this._state.stdinRequest = null;
        const isQuit = input.data === "q";
        if (isQuit) {
            this.closeStepByStepSession();
        } else {
            this._stepRunner.responded();
        }
    }

    stepByStepRespond(response: WaldiezChatUserInput, sessionContext: ISessionContext): void {
        if (this._state.stdinRequest) {
            sessionContext.session?.kernel?.sendInputReply(
                { value: JSON.stringify(response), status: "ok" },
                this._state.stdinRequest.parent_header as any,
            );
        }
        this._state.stdinRequest = null;
        this._stepRunner.responded();
    }

    closeStepByStepSession(): void {
        this._resetStepByStepState();
        this._signal.emit({ chat: undefined, stepByStep: undefined });
        this._stepRunner.reset();

        if (this._kernelManager) {
            // noinspection JSIgnoredPromiseFromCall
            this._kernelManager.restart();
        }
        try {
            afterInterrupt();
        } catch {
            //
        }
    }

    // Event handlers for runners
    private _onChatStdin(msg: IInputRequestMsg): void {
        let prompt = msg.content.prompt;
        if (prompt === ">" || prompt === "> ") {
            prompt = WALDIEZ_STRINGS.ON_EMPTY_PROMPT;
        }
        this._logger.log({
            data: prompt,
            level: "warning",
            type: "text",
        });
        this._state.stdinRequest = msg;
        this._askForInput();
    }

    private _onStepStdin(msg: IInputRequestMsg): void {
        let prompt = msg.content.prompt;
        if (prompt === ">" || prompt === "> ") {
            prompt = WALDIEZ_STRINGS.ON_EMPTY_PROMPT;
        }
        this._logger.log({
            data: prompt,
            level: "warning",
            type: "text",
        });
        this._state.stdinRequest = msg;
    }

    private _askForInput(): void {
        const messages = this._standardRunner.getPreviousMessages();
        let request_id: string;
        if (typeof this._state.stdinRequest?.metadata.request_id === "string") {
            request_id = this._state.stdinRequest.metadata.request_id;
        } else {
            request_id = this._standardRunner.requestId ?? this._getRequestIdFromPreviousMessages(messages);
        }

        const chat: WaldiezChatConfig = {
            ...this._state.chat,
            show: true,
            active: true,
            messages,
            userParticipants: this._standardRunner.getUserParticipants(),
            activeRequest: {
                request_id,
                prompt: this._state.stdinRequest?.content.prompt ?? "> ",
                password: this._state.stdinRequest?.content.password ?? false,
            },
        };
        this._signal.emit({ chat, stepByStep: undefined });
    }

    private _onEnd(): void {
        this._signal.emit({
            chat: {
                ...this._state.chat,
                messages: this._standardRunner.getPreviousMessages(),
                timeline: this._standardRunner.getTimelineData(),
                userParticipants: this._standardRunner.getUserParticipants(),
                activeRequest: undefined,
                handlers: undefined,
            },
            stepByStep: undefined,
        });
    }

    private _onChatUpdate(updateData: Partial<WaldiezChatConfig>): void {
        const { handlers, ...restUpdateData } = updateData;

        const chatConfig = {
            ...this._state.chat,
            ...restUpdateData,
            handlers: {
                ...this._state.chat.handlers,
                ...(handlers || {}),
            },
        };
        this._state.chat = chatConfig;
        this._signal.emit({
            chat: chatConfig,
            stepByStep: undefined,
        });
    }

    private _onStepUpdate(updateData: Partial<WaldiezStepByStep>): void {
        const { show, active, ...restStepUpdateData } = updateData;
        this._state.stepByStep = {
            ...this._state.stepByStep,
            ...restStepUpdateData,
            show: typeof show === "boolean" ? show : this._state.stepByStep.show,
            active: typeof active === "boolean" ? active : this._state.stepByStep.active,
        };
        this._signal.emit({
            chat: undefined,
            stepByStep: this._state.stepByStep,
        });
    }

    private _getRequestIdFromPreviousMessages(previousMessages: WaldiezChatMessage[]): string {
        const inputRequestMessage = previousMessages.find(msg => msg.type === "input_request");
        if (inputRequestMessage) {
            return inputRequestMessage.request_id ?? "<unknown>";
        }
        return "<unknown>";
    }

    dispose(): void {
        this._standardRunner.reset(true);
        this._stepRunner.reset();
    }
}
