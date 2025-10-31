/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { WaldiezExecutionManager, WaldiezKernelManager } from "../../editor";
import { WaldiezLogger } from "../../logger";
import { editorContext, inputRequestMessage } from "../utils";
import { Signal } from "@lumino/signaling";

// Mock dependencies
jest.mock("../../logger");
jest.mock("../../runner", () => ({
    WaldiezStandardRunner: jest.fn().mockImplementation(() => ({
        run: jest.fn(),
        reset: jest.fn(),
        setTimelineData: jest.fn(),
        getPreviousMessages: jest.fn().mockReturnValue([]),
        getUserParticipants: jest.fn().mockReturnValue([]),
        getTimelineData: jest.fn().mockReturnValue(undefined),
        get requestId() {
            return "<stdin-request-id>";
        },
    })),
    WaldiezStepRunner: jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        reset: jest.fn(),
        responded: jest.fn(),
        get requestId() {
            return "<stdin-request-id>";
        },
    })),
}));

jest.mock("../../rest", () => ({
    getWaldiezActualPath: jest.fn().mockResolvedValue("/actual/path/test.waldiez"),
    afterInterrupt: jest.fn(),
}));

jest.mock("@waldiez/react", () => ({
    WaldiezChatConfig: {},
    WaldiezStepByStep: {},
    WaldiezChatHandlers: {},
    WaldiezStepHandlers: {},
}));

describe("WaldiezExecutionManager", () => {
    let executionManager: WaldiezExecutionManager;
    let logger: jest.Mocked<WaldiezLogger>;
    let signal: Signal<any, any>;
    let mockStandardRunner: any;
    let mockStepRunner: any;

    beforeEach(() => {
        logger = {
            log: jest.fn(),
            warning: jest.fn(),
            error: jest.fn(),
        } as any;

        signal = new Signal({});
        mockStandardRunner = {
            run: jest.fn(),
            reset: jest.fn(),
            setTimelineData: jest.fn(),
            getPreviousMessages: jest.fn().mockReturnValue([]),
            getUserParticipants: jest.fn().mockReturnValue([]),
            getTimelineData: jest.fn().mockReturnValue(undefined),
            get requestId() {
                return "<stdin-request-id>";
            },
        };

        mockStepRunner = {
            start: jest.fn(),
            reset: jest.fn(),
            responded: jest.fn(),
            get requestId() {
                return "<stdin-request-id>";
            },
        };
        const { WaldiezStandardRunner, WaldiezStepRunner } = require("../../runner");
        WaldiezStandardRunner.mockImplementation(() => mockStandardRunner);
        WaldiezStepRunner.mockImplementation(() => mockStepRunner);
        executionManager = new WaldiezExecutionManager(logger, "http://localhost", signal);
    });

    afterEach(() => {
        jest.clearAllMocks();
        executionManager.dispose();
    });

    describe("setDependencies", () => {
        it("should store session context and kernel manager", () => {
            const sessionContext = editorContext.sessionContext as any;
            const kernelManager = {} as WaldiezKernelManager;

            executionManager.setDependencies(sessionContext, kernelManager);
            expect(true).toBe(true);
        });
    });

    describe("executeStandard", () => {
        it("should execute standard workflow", async () => {
            const context = {
                kernel: { status: "idle" } as any,
                filePath: "/path/test.waldiez",
                contents: "test content",
            };

            const signalEmitSpy = jest.spyOn(signal, "emit");

            await executionManager.executeStandard(context);

            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: undefined,
                stepByStep: undefined,
            });
            expect(mockStandardRunner.run).toHaveBeenCalledWith(context.kernel, "/actual/path/test.waldiez");
        });

        it("should throw error when no kernel", async () => {
            const context = {
                kernel: null as any,
                filePath: "/path/test.waldiez",
                contents: "test content",
            };

            await expect(executionManager.executeStandard(context)).rejects.toThrow("No kernel");
        });

        it("should handle execution error", async () => {
            const context = {
                kernel: { status: "idle" } as any,
                filePath: "/path/test.waldiez",
                contents: "test content",
            };

            const { getWaldiezActualPath } = require("../../rest");
            getWaldiezActualPath.mockRejectedValueOnce(new Error("Path error"));

            await expect(executionManager.executeStandard(context)).rejects.toThrow("Path error");
            expect(logger.log).toHaveBeenCalledWith({
                data: "Error: Path error",
                level: "error",
                type: "text",
            });
        });
    });

    describe("executeStepByStep", () => {
        it("should execute step-by-step workflow", async () => {
            const context = {
                kernel: { status: "idle" } as any,
                filePath: "/path/test.waldiez",
                contents: "test content",
            };

            const signalEmitSpy = jest.spyOn(signal, "emit");

            await executionManager.executeStepByStep(context);

            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: undefined,
                stepByStep: undefined,
            });
            expect(mockStepRunner.start).toHaveBeenCalledWith(
                context.kernel,
                "/actual/path/test.waldiez",
                undefined,
                undefined,
            );
        });

        it("should throw error when no kernel", async () => {
            const context = {
                kernel: null as any,
                filePath: "/path/test.waldiez",
                contents: "test content",
            };

            await expect(executionManager.executeStepByStep(context)).rejects.toThrow("No kernel");
        });
    });

    describe("handleUserInput", () => {
        it("should handle user input with session context", () => {
            const sessionContext = {
                session: {
                    kernel: {
                        sendInputReply: jest.fn(),
                    },
                },
            } as any;

            const kernelManager = {} as WaldiezKernelManager;
            executionManager.setDependencies(sessionContext, kernelManager);

            // Simulate stdin request
            executionManager["_state"].stdinRequest = {
                ...inputRequestMessage,
                // @ts-expect-error msg type
                parent_header: { msg_id: "test" },
            };

            const userInput = {
                id: "<stdin-request-id>",
                type: "input_response" as const,
                data: "test input",
                timestamp: Date.now(),
            };

            executionManager.handleUserInput(userInput, sessionContext);

            expect(sessionContext.session.kernel.sendInputReply).toHaveBeenCalledWith(
                { value: JSON.stringify(userInput), status: "ok" },
                { msg_id: "test" },
            );
            expect(logger.log).toHaveBeenCalledWith({
                data: JSON.stringify(userInput),
                level: "info",
                type: "text",
            });
        });

        it("should not handle input without stdin request", () => {
            const sessionContext = {
                session: {
                    kernel: {
                        sendInputReply: jest.fn(),
                    },
                },
            } as any;

            const userInput = {
                id: "<stdin-request-id>",
                type: "input_response" as const,
                data: "test input",
                timestamp: Date.now(),
            };

            executionManager.handleUserInput(userInput, sessionContext);

            expect(sessionContext.session.kernel.sendInputReply).not.toHaveBeenCalled();
        });
    });

    describe("handleInterrupt", () => {
        it("should handle interrupt with kernel manager", () => {
            const kernelManager = {
                restart: jest.fn(),
            } as any;
            const sessionContext = editorContext.sessionContext as any;

            executionManager.setDependencies(sessionContext, kernelManager);

            const signalEmitSpy = jest.spyOn(signal, "emit");

            executionManager.handleInterrupt(kernelManager);

            expect(mockStandardRunner.reset).toHaveBeenCalled();
            expect(mockStandardRunner.setTimelineData).toHaveBeenCalledWith(undefined);
            expect(kernelManager.restart).toHaveBeenCalled();
            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: {
                    show: false,
                    active: false,
                    messages: [],
                    timeline: undefined,
                    userParticipants: [],
                    activeRequest: undefined,
                },
                stepByStep: undefined,
            });
        });
    });

    describe("handleClose", () => {
        it("should handle close event", () => {
            const signalEmitSpy = jest.spyOn(signal, "emit");

            executionManager.handleClose();

            expect(mockStandardRunner.reset).toHaveBeenCalled();
            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: undefined,
                stepByStep: undefined,
            });
        });
    });

    describe("sendControl", () => {
        it("should send control input", () => {
            const sessionContext = {
                session: {
                    kernel: {
                        sendInputReply: jest.fn(),
                    },
                },
            } as any;

            const kernelManager = {} as WaldiezKernelManager;
            executionManager.setDependencies(sessionContext, kernelManager);

            // Simulate stdin request
            executionManager["_state"].stdinRequest = {
                ...inputRequestMessage,
                // @ts-expect-error stdinRequest type
                parent_header: { msg_id: "test" },
            };

            const controlInput = {
                data: "continue",
                request_id: "test-id",
            };

            executionManager.sendControl(controlInput, sessionContext);

            expect(sessionContext.session.kernel.sendInputReply).toHaveBeenCalledWith(
                {
                    value: JSON.stringify({
                        ...controlInput,
                        request_id: "<stdin-request-id>",
                        type: "debug_input_response",
                    }),
                    status: "ok",
                },
                { msg_id: "test" },
            );
            expect(mockStepRunner.responded).toHaveBeenCalled();
        });

        it("should log error when no stdin request", () => {
            const sessionContext = {} as any;
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            const controlInput = {
                data: "continue",
                request_id: "test-id",
            };

            executionManager.sendControl(controlInput, sessionContext);

            expect(consoleSpy).toHaveBeenCalledWith("StepByStep response received without stdin request");

            consoleSpy.mockRestore();
        });
    });

    describe("stepByStepRespond", () => {
        it("should handle step by step response", () => {
            const sessionContext = {
                session: {
                    kernel: {
                        sendInputReply: jest.fn(),
                    },
                },
            } as any;

            const kernelManager = {} as WaldiezKernelManager;
            executionManager.setDependencies(sessionContext, kernelManager);
            executionManager["_state"].stdinRequest = {
                ...inputRequestMessage,
                // @ts-expect-error stdinRequest type
                parent_header: { msg_id: "test" },
            };

            const response = {
                id: "<stdin-request-id>",
                type: "input_response" as const,
                data: "test response",
                timestamp: Date.now(),
            };

            executionManager.stepByStepRespond(response, sessionContext);

            expect(sessionContext.session.kernel.sendInputReply).toHaveBeenCalledWith(
                { value: JSON.stringify(response), status: "ok" },
                { msg_id: "test" },
            );
            expect(mockStepRunner.responded).toHaveBeenCalled();
        });
    });

    describe("closeStepByStepSession", () => {
        it("should close step by step session", () => {
            const signalEmitSpy = jest.spyOn(signal, "emit");

            executionManager.closeStepByStepSession();

            expect(mockStepRunner.reset).toHaveBeenCalled();
            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: undefined,
                stepByStep: undefined,
            });
        });
    });

    describe("private handler methods", () => {
        describe("_onChatStdin", () => {
            it("should handle chat stdin", () => {
                const signalEmitSpy = jest.spyOn(signal, "emit");
                const stdinMsg = {
                    ...inputRequestMessage,
                    metadata: { request_id: "test-id" },
                };

                executionManager["_onChatStdin"](stdinMsg);

                expect(logger.log).toHaveBeenCalledWith({
                    data: ">>>",
                    level: "warning",
                    type: "text",
                });
                expect(signalEmitSpy).toHaveBeenCalled();
            });

            it("should handle empty prompt", () => {
                const stdinMsg = {
                    ...inputRequestMessage,
                    content: { prompt: "> ", password: false },
                };

                executionManager["_onChatStdin"](stdinMsg);

                expect(logger.log).toHaveBeenCalledWith({
                    data: "Enter your message to start the chat:",
                    level: "warning",
                    type: "text",
                });
            });
        });

        describe("_onStepStdin", () => {
            it("should handle step stdin", () => {
                const stdinMsg = { ...inputRequestMessage };

                executionManager["_onStepStdin"](stdinMsg);

                expect(logger.log).toHaveBeenCalledWith({
                    data: ">>>",
                    level: "warning",
                    type: "text",
                });
                expect(executionManager["_state"].stdinRequest).toBe(stdinMsg);
            });
        });
    });
    describe("handler factory methods without dependencies", () => {
        it("should log error when userInput handler called without sessionContext", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            // Don't call setDependencies, so _sessionContext remains null
            const userInputHandler = executionManager["_createUserInputHandler"]();

            userInputHandler({ id: "resp", type: "input_response", data: "test", timestamp: Date.now() });

            expect(consoleSpy).toHaveBeenCalledWith("SessionContext not available for user input");
            consoleSpy.mockRestore();
        });

        // noinspection DuplicatedCode
        it("should log error when interrupt handler called without kernelManager", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            const interruptHandler = executionManager["_createInterruptHandler"]();

            interruptHandler();

            expect(consoleSpy).toHaveBeenCalledWith("KernelManager not available for interrupt");
            consoleSpy.mockRestore();
        });

        it("should log error when sendControl handler called without sessionContext", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            const sendControlHandler = executionManager["_createSendControlHandler"]();

            sendControlHandler({ data: "continue", request_id: "test" });

            expect(consoleSpy).toHaveBeenCalledWith("SessionContext not available for send control");
            consoleSpy.mockRestore();
        });

        it("should log error when stepByStepRespond handler called without sessionContext", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            const respondHandler = executionManager["_createStepByStepRespondHandler"]();

            respondHandler({ id: "resp-1", type: "input_response", data: "test", timestamp: Date.now() });

            expect(consoleSpy).toHaveBeenCalledWith("SessionContext not available for step response");
            consoleSpy.mockRestore();
        });
    });
    describe("handler factory methods without dependencies", () => {
        it("should log error when userInput handler called without sessionContext", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            // Don't call setDependencies, so _sessionContext remains null
            const userInputHandler = executionManager["_createUserInputHandler"]();

            userInputHandler({ id: "resp-1", type: "input_response", data: "test", timestamp: Date.now() });

            expect(consoleSpy).toHaveBeenCalledWith("SessionContext not available for user input");
            consoleSpy.mockRestore();
        });

        // noinspection DuplicatedCode
        it("should log error when interrupt handler called without kernelManager", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            const interruptHandler = executionManager["_createInterruptHandler"]();

            interruptHandler();

            expect(consoleSpy).toHaveBeenCalledWith("KernelManager not available for interrupt");
            consoleSpy.mockRestore();
        });

        it("should log error when sendControl handler called without sessionContext", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            const sendControlHandler = executionManager["_createSendControlHandler"]();

            sendControlHandler({ data: "continue", request_id: "test" });

            expect(consoleSpy).toHaveBeenCalledWith("SessionContext not available for send control");
            consoleSpy.mockRestore();
        });

        it("should log error when stepByStepRespond handler called without sessionContext", () => {
            const consoleSpy = jest.spyOn(console, "error").mockImplementation();

            const respondHandler = executionManager["_createStepByStepRespondHandler"]();

            respondHandler({ id: "resp-1", type: "input_response", data: "test", timestamp: Date.now() });

            expect(consoleSpy).toHaveBeenCalledWith("SessionContext not available for step response");
            consoleSpy.mockRestore();
        });
    });
    describe("state management edge cases", () => {
        it("should handle _onEnd when runners return undefined data", () => {
            mockStandardRunner.getPreviousMessages.mockReturnValue(undefined);
            mockStandardRunner.getTimelineData.mockReturnValue(null);
            mockStandardRunner.getUserParticipants.mockReturnValue(undefined);

            const signalEmitSpy = jest.spyOn(signal, "emit");

            executionManager["_onEnd"]();

            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: expect.objectContaining({
                    messages: undefined,
                    timeline: null,
                    userParticipants: undefined,
                }),
                stepByStep: undefined,
            });
        });

        it("should handle _onChatUpdate with no handlers", () => {
            const updateData = {
                messages: [
                    { id: "msg-1", type: "text", content: "test", timestamp: new Date().toISOString() },
                ],
                // No handlers provided
            };

            const signalEmitSpy = jest.spyOn(signal, "emit");

            executionManager["_onChatUpdate"](updateData);

            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: expect.objectContaining({
                    messages: updateData.messages,
                    handlers: expect.any(Object), // Should keep existing handlers
                }),
                stepByStep: undefined,
            });
        });
    });
    describe("_onStepUpdate method", () => {
        it("should update step by step state with active=false when explicitly set", () => {
            const updateData = {
                active: false,
                eventHistory: [{ type: "event1" }],
            };

            const signalEmitSpy = jest.spyOn(signal, "emit");

            executionManager["_onStepUpdate"](updateData);

            expect(executionManager["_state"].stepByStep.active).toBe(false);
            expect(signalEmitSpy).toHaveBeenCalledWith({
                chat: undefined,
                stepByStep: expect.objectContaining({
                    active: false,
                    eventHistory: [{ type: "event1" }],
                }),
            });
        });

        it("should update step by step state with active=true when explicitly set", () => {
            const updateData = {
                active: true,
                pendingControlInput: { request_id: "test", prompt: "continue?" },
            };

            executionManager["_onStepUpdate"](updateData);

            expect(executionManager["_state"].stepByStep.active).toBe(true);
            expect(executionManager["_state"].stepByStep.pendingControlInput).toEqual({
                request_id: "test",
                prompt: "continue?",
            });
        });

        it("should preserve existing state when updating with partial data", () => {
            // Set initial state
            executionManager["_state"].stepByStep = {
                show: false,
                active: false,
                stepMode: true,
                autoContinue: true,
                breakpoints: ["bp1"],
                eventHistory: [{ type: "existing" }],
                currentEvent: { type: "existing" },
                help: [],
                lastError: "existing error",
                pendingControlInput: { request_id: "existing", prompt: "existing" },
                activeRequest: { request_id: "existing", prompt: "existing", password: false },
                handlers: {} as any,
            };

            const updateData = {
                eventHistory: [{ type: "new" }],
                // Only updating eventHistory, other fields should be preserved
            };

            executionManager["_onStepUpdate"](updateData);

            expect(executionManager["_state"].stepByStep).toEqual({
                show: false, // Preserved
                active: false, // Preserved
                stepMode: true, // Preserved
                autoContinue: true, // Preserved
                breakpoints: ["bp1"], // Preserved
                eventHistory: [{ type: "new" }], // Updated
                currentEvent: { type: "existing" }, // Preserved
                help: [], // Preserved
                lastError: "existing error", // Preserved
                pendingControlInput: { request_id: "existing", prompt: "existing" }, // Preserved
                activeRequest: { request_id: "existing", prompt: "existing", password: false }, // Preserved
                handlers: {}, // Preserved
            });
        });
    });
    describe("_getRequestIdFromPreviousMessages method", () => {
        it("should return request_id from input_request message", () => {
            const messages = [
                {
                    type: "text",
                    content: "regular message",
                    id: "1",
                    timestamp: "2023-01-01T00:00:00Z",
                },
                {
                    type: "input_request",
                    content: "input prompt",
                    id: "2",
                    timestamp: "2023-01-01T00:01:00Z",
                    request_id: "found-request-123",
                },
                {
                    type: "text",
                    content: "another message",
                    id: "3",
                    timestamp: "2023-01-01T00:02:00Z",
                },
            ] as any[];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("found-request-123");
        });

        it("should return first input_request when multiple exist", () => {
            const messages = [
                {
                    type: "input_request",
                    request_id: "first-request",
                    id: "1",
                    timestamp: "2023-01-01T00:00:00Z",
                },
                {
                    type: "input_request",
                    request_id: "second-request",
                    id: "2",
                    timestamp: "2023-01-01T00:01:00Z",
                },
            ] as any[];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("first-request");
        });

        it("should return '<unknown>' when input_request has no request_id", () => {
            const messages = [
                {
                    type: "input_request",
                    content: "input prompt",
                    id: "1",
                    timestamp: "2023-01-01T00:00:00Z",
                    // No request_id field
                },
            ] as any[];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("<unknown>");
        });

        it("should return '<unknown>' when input_request has null request_id", () => {
            const messages = [
                {
                    type: "input_request",
                    content: "input prompt",
                    id: "1",
                    timestamp: "2023-01-01T00:00:00Z",
                    request_id: null,
                },
            ] as any[];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("<unknown>");
        });

        it("should return '<unknown>' when input_request has undefined request_id", () => {
            const messages = [
                {
                    type: "input_request",
                    content: "input prompt",
                    id: "1",
                    timestamp: "2023-01-01T00:00:00Z",
                    request_id: undefined,
                },
            ] as any[];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("<unknown>");
        });

        it("should return '<unknown>' when no input_request messages exist", () => {
            const messages = [
                {
                    type: "text",
                    content: "regular message",
                    id: "1",
                    timestamp: "2023-01-01T00:00:00Z",
                },
                {
                    type: "system",
                    content: "system message",
                    id: "2",
                    timestamp: "2023-01-01T00:01:00Z",
                },
            ] as any[];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("<unknown>");
        });

        it("should return '<unknown>' when messages array is empty", () => {
            const messages: any[] = [];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("<unknown>");
        });

        it("should handle messages with different types correctly", () => {
            const messages = [
                { type: "error", id: "1" },
                { type: "warning", id: "2" },
                { type: "input_request", request_id: "correct-id", id: "3" },
                { type: "response", id: "4" },
            ] as any[];

            const result = executionManager["_getRequestIdFromPreviousMessages"](messages);

            expect(result).toBe("correct-id");
        });
    });
});
