/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { WaldiezLogger } from "../../logger";
import { WaldiezStepRunner } from "../../runner";
import { inputRequestMessage } from "../utils";
import { Kernel } from "@jupyterlab/services";
import type { IInputRequestMsg } from "@jupyterlab/services/lib/kernel/messages";

// Mock dependencies
jest.mock("../../logger");
jest.mock("../../runner/common", () => ({
    getCodeToExecute: jest.fn().mockReturnValue("mocked python code"),
    getUploadsRoot: jest.fn().mockReturnValue("/mocked/uploads"),
    normalizeLogEntry: jest.fn().mockImplementation(entry => [entry]),
    parseRequestId: jest.fn(),
    strip_ansi: jest.fn().mockImplementation(str => str),
}));

jest.mock("@waldiez/react", () => ({
    WaldiezStepByStepProcessor: {
        process: jest.fn(),
    },
    WaldiezChatMessageProcessor: {
        process: jest.fn(),
    },
}));

describe("WaldiezStepRunner", () => {
    let stepRunner: WaldiezStepRunner;
    let mockLogger: jest.Mocked<WaldiezLogger>;
    let mockOnStdin: jest.Mock;
    let mockOnUpdate: jest.Mock;
    let mockOnEnd: jest.Mock;
    let mockKernel: jest.Mocked<Kernel.IKernelConnection>;
    let mockFuture: any;

    const CONTROL_PROMPT = "[Step] (c)ontinue, (r)un, (q)uit, (i)nfo, (h)elp, (st)ats: ";
    const END_MARKER = "<Waldiez> - Done running the flow.";

    beforeEach(() => {
        mockLogger = {
            log: jest.fn(),
            error: jest.fn(),
        } as any;

        mockOnStdin = jest.fn();
        mockOnUpdate = jest.fn();
        mockOnEnd = jest.fn();

        mockFuture = {
            onStdin: jest.fn(),
            onIOPub: jest.fn(),
            onReply: jest.fn(),
            done: Promise.resolve({}),
            dispose: jest.fn(),
        };

        mockKernel = {
            requestExecute: jest.fn().mockReturnValue(mockFuture),
            sendInputReply: jest.fn(),
            restart: jest.fn(),
            interrupt: jest.fn(),
        } as any;

        stepRunner = new WaldiezStepRunner({
            logger: mockLogger,
            baseUrl: "http://localhost:8888",
            onStdin: mockOnStdin,
            onUpdate: mockOnUpdate,
            onEnd: mockOnEnd,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("constructor", () => {
        it("should initialize with empty event history", () => {
            expect(stepRunner["_eventHistory"]).toBeInstanceOf(Set);
            expect(stepRunner["_eventHistory"].size).toBe(0);
            expect(stepRunner["_currentEvent"]).toBeUndefined();
        });

        it("should set up base runner properties", () => {
            expect(stepRunner["_logger"]).toBe(mockLogger);
            expect(stepRunner["_onStdin"]).toBe(mockOnStdin);
            expect(stepRunner["_onUpdate"]).toBe(mockOnUpdate);
            expect(stepRunner["_onEnd"]).toBe(mockOnEnd);
        });
    });

    describe("requestId getter", () => {
        it("should return the current request ID", () => {
            stepRunner["_requestId"] = "test-request-123";
            expect(stepRunner.requestId).toBe("test-request-123");
        });

        it("should return null when no request ID is set", () => {
            stepRunner["_requestId"] = null;
            expect(stepRunner.requestId).toBeNull();
        });
    });

    describe("start", () => {
        it("should execute file in debug mode", () => {
            const filePath = "/path/to/test.waldiez";

            stepRunner.start(mockKernel, filePath);

            expect(mockKernel.requestExecute).toHaveBeenCalledWith(
                {
                    code: "mocked python code",
                    stop_on_error: true,
                },
                true,
            );
        });

        it("should call executeFile with debug mode", () => {
            const executeFileSpy = jest.spyOn(stepRunner as any, "executeFile");
            const filePath = "/path/to/test.waldiez";

            stepRunner.start(mockKernel, filePath);

            expect(executeFileSpy).toHaveBeenCalledWith(mockKernel, filePath, "debug", undefined, undefined);
        });

        it("should call executeFile with debug mode and initial breakpoints", () => {
            const executeFileSpy = jest.spyOn(stepRunner as any, "executeFile");
            const filePath = "/path/to/test.waldiez";
            const breakpoints = [
                { type: "event" as const, event_type: "tool_call", description: "Break on tool calls" },
            ];

            stepRunner.start(mockKernel, filePath, breakpoints);

            expect(executeFileSpy).toHaveBeenCalledWith(
                mockKernel,
                filePath,
                "debug",
                ["event:tool_call"],
                undefined,
            );
        });
    });

    describe("responded", () => {
        it("should clear expecting user input state", () => {
            stepRunner["_expectingUserInput"] = true;

            stepRunner.responded();

            expect(stepRunner["_expectingUserInput"]).toBe(false);
            expect(mockOnUpdate).toHaveBeenCalledWith({
                pendingControlInput: undefined,
                activeRequest: undefined,
            });
        });
    });

    describe("reset", () => {
        it("should reset event history and current event", () => {
            stepRunner["_eventHistory"].add({ type: "test" });
            stepRunner["_currentEvent"] = { type: "current" };

            stepRunner.reset();

            expect(stepRunner["_eventHistory"].size).toBe(0);
            expect(stepRunner["_currentEvent"]).toBeUndefined();
        });

        it("should call parent reset", () => {
            const superResetSpy = jest.spyOn(
                Object.getPrototypeOf(Object.getPrototypeOf(stepRunner)),
                "reset",
            );

            stepRunner.reset();

            expect(superResetSpy).toHaveBeenCalled();
        });
    });

    describe("onStdin", () => {
        it("should handle control prompt input", () => {
            const msg: IInputRequestMsg = {
                ...inputRequestMessage,
                content: { prompt: CONTROL_PROMPT, password: false },
            };
            stepRunner["_running"] = true;
            stepRunner.onStdin(msg);

            expect(stepRunner["_expectingUserInput"]).toBe(true);
            expect(mockOnUpdate).toHaveBeenCalledWith({
                active: true,
                pendingControlInput: {
                    request_id: "<unknown>",
                    prompt: CONTROL_PROMPT,
                },
            });
            expect(stepRunner["_inputRequest"]).toBe(msg);
            expect(mockOnStdin).toHaveBeenCalledWith(msg);
        });

        it("should handle regular input prompt", () => {
            const msg: IInputRequestMsg = {
                ...inputRequestMessage,
                content: { prompt: "Enter value:", password: true },
            };
            stepRunner["_running"] = true;
            stepRunner["_requestId"] = "test-123";

            stepRunner.onStdin(msg);

            expect(mockOnUpdate).toHaveBeenCalledWith({
                active: true,
                pendingControlInput: undefined,
                activeRequest: {
                    request_id: "test-123",
                    prompt: "Enter value:",
                    password: true,
                },
            });
        });

        it("should set metadata with request ID", () => {
            const msg: IInputRequestMsg = {
                ...inputRequestMessage,
                content: { prompt: "test", password: false },
            };
            stepRunner["_requestId"] = "req-456";

            stepRunner.onStdin(msg);

            expect(msg.metadata).toEqual({
                request_id: "req-456",
            });
        });
    });

    describe("processMessage", () => {
        beforeEach(() => {
            const { parseRequestId } = require("../../runner/common");
            parseRequestId.mockReturnValue(null); // Default to no request ID
        });

        it("should handle end marker message", () => {
            // @ts-expect-error protected method
            stepRunner.processMessage(END_MARKER + "\n");

            expect(mockOnUpdate).toHaveBeenCalledWith({ active: false });
        });

        it("should parse and set request ID", () => {
            const { parseRequestId } = require("../../runner/common");
            parseRequestId.mockReturnValue("new-request-123");

            // @ts-expect-error protected method
            stepRunner.processMessage("message with request id");

            expect(stepRunner["_requestId"]).toBe("new-request-123");
        });

        it("should process message with WaldiezStepByStepProcessor", () => {
            const { WaldiezStepByStepProcessor } = require("@waldiez/react");
            const mockResult = {
                stateUpdate: {
                    eventHistory: [{ type: "step", data: "test" }],
                },
            };
            WaldiezStepByStepProcessor.process.mockReturnValue(mockResult);
            // @ts-expect-error protected method
            stepRunner.processMessage("step message");

            expect(WaldiezStepByStepProcessor.process).toHaveBeenCalledWith("step message");
            expect(stepRunner["_eventHistory"].size).toBe(1);
            expect(mockOnUpdate).toHaveBeenCalledWith({
                active: false,
                eventHistory: [{ type: "step", data: "test" }],
                currentEvent: { type: "step", data: "test" },
                lastError: undefined,
            });
        });

        it("should handle debug message when no state update", () => {
            const { WaldiezStepByStepProcessor } = require("@waldiez/react");
            const mockResult = {
                debugMessage: { type: "debug", content: "debug info" },
            };
            WaldiezStepByStepProcessor.process.mockReturnValue(mockResult);
            // @ts-expect-error protected method
            stepRunner.processMessage("debug message");

            expect(stepRunner["_eventHistory"].has(mockResult.debugMessage)).toBe(true);
        });

        it("should handle processing errors", () => {
            const { WaldiezStepByStepProcessor } = require("@waldiez/react");
            const errorResult = {
                error: {
                    message: "Processing failed",
                    originalData: "original message",
                },
            };
            WaldiezStepByStepProcessor.process.mockReturnValue(errorResult);

            const handleErrorSpy = jest.spyOn(stepRunner as any, "_handleStepProcessError");
            // @ts-expect-error protected method
            stepRunner.processMessage("error message");

            expect(handleErrorSpy).toHaveBeenCalledWith("error message", errorResult);
        });
    });

    describe("_handleStepProcessError", () => {
        let mockStepProcessor: any;
        let mockChatProcessor: any;

        beforeEach(() => {
            const { WaldiezStepByStepProcessor, WaldiezChatMessageProcessor } = require("@waldiez/react");
            mockStepProcessor = WaldiezStepByStepProcessor;
            mockChatProcessor = WaldiezChatMessageProcessor;
        });

        it("should return original result if no error", () => {
            const result = { stateUpdate: { eventHistory: [] } };

            const output = stepRunner["_handleStepProcessError"]("message", result);

            expect(output).toBe(result);
        });

        it("should fall back to chat processor if step processor still fails", () => {
            const errorResult = {
                error: { message: "Parse error" },
            };
            const jsonMessage = '{"type": "chat_message"}';
            const chatResult = {
                message: { type: "text", content: "chat message" },
            };

            mockStepProcessor.process.mockReturnValue(errorResult);
            mockChatProcessor.process.mockReturnValue(chatResult);

            const output = stepRunner["_handleStepProcessError"](jsonMessage, errorResult);

            expect(mockChatProcessor.process).toHaveBeenCalledWith(jsonMessage);
            expect(output).toEqual({
                stateUpdate: {
                    eventHistory: [chatResult.message],
                },
            });
        });

        it("should handle JSON parsing errors", () => {
            const errorResult = {
                error: { message: "Parse error", originalData: "invalid json" },
            };

            const output = stepRunner["_handleStepProcessError"]("invalid json", errorResult);

            expect(output).toBeUndefined();
        });

        it("should handle nested JSON structure", () => {
            const errorResult = {
                error: { message: "Parse error" },
            };
            const jsonMessage = '{"type": "print", "data": {"type": "nested"}}';
            const successResult = { stateUpdate: { eventHistory: [] } };

            mockStepProcessor.process.mockReturnValueOnce(errorResult).mockReturnValueOnce(successResult);

            stepRunner["_handleStepProcessError"](jsonMessage, errorResult);

            expect(mockStepProcessor.process).toHaveBeenCalledWith({ type: "nested" });
        });
    });

    describe("_chatResultToStepResult", () => {
        it("should convert chat result to step result", () => {
            const chatResult = {
                message: {
                    id: "123",
                    timestamp: new Date().toISOString(),
                    type: "text",
                    content: [{ type: "text" as const, text: "Hello" }],
                },
            };

            const result = stepRunner["_chatResultToStepResult"](chatResult);

            expect(result).toEqual({
                stateUpdate: {
                    eventHistory: [chatResult.message],
                },
            });
        });
    });

    describe("event history management", () => {
        it("should handle non-object events in history", () => {
            const { WaldiezStepByStepProcessor } = require("@waldiez/react");
            const stringEvent = "string event";

            WaldiezStepByStepProcessor.process.mockReturnValue({
                stateUpdate: {
                    eventHistory: [stringEvent],
                },
            });

            // @ts-expect-error protected method
            stepRunner.processMessage("test message");

            expect(stepRunner["_currentEvent"]).toBeUndefined();
        });

        it("should emit reversed event history", () => {
            const { WaldiezStepByStepProcessor } = require("@waldiez/react");
            const events = [{ type: "event1" }, { type: "event2" }, { type: "event3" }];

            WaldiezStepByStepProcessor.process.mockReturnValue({
                stateUpdate: {
                    eventHistory: events,
                },
            });
            // @ts-expect-error protected method
            stepRunner.processMessage("test message");

            expect(mockOnUpdate).toHaveBeenCalledWith({
                active: false,
                eventHistory: events.reverse(),
                currentEvent: { type: "event3" },
                lastError: undefined,
            });
        });
    });
    describe("integration scenarios", () => {
        it("should handle complete step-by-step workflow", async () => {
            // Start execution
            stepRunner.start(mockKernel, "/path/to/test.waldiez");

            // Simulate control prompt
            const controlMsg: IInputRequestMsg = {
                ...inputRequestMessage,
                content: { prompt: CONTROL_PROMPT, password: false },
            };
            stepRunner.onStdin(controlMsg);

            // Respond to control
            stepRunner.responded();

            // Process step message
            const { WaldiezStepByStepProcessor } = require("@waldiez/react");
            WaldiezStepByStepProcessor.process.mockReturnValue({
                stateUpdate: {
                    eventHistory: [{ type: "step_complete" }],
                },
            });
            // @ts-expect-error protected method
            stepRunner.processMessage("step executed");

            // End execution
            // @ts-expect-error protected method
            stepRunner.processMessage(END_MARKER);

            expect(mockOnUpdate).toHaveBeenCalledWith({ active: false });
        });

        it("should handle request ID parsing and setting", () => {
            const { parseRequestId } = require("../../runner/common");
            parseRequestId.mockReturnValue("parsed-id-123");
            // @ts-expect-error protected method
            stepRunner.processMessage("message with request id");

            expect(stepRunner.requestId).toBe("parsed-id-123");
        });
    });
});
