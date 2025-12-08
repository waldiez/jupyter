/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "../../logger";
import { WaldiezStandardRunner } from "../../runner";
import { errorMsg, executeReplyMessage, inputRequestMessage, iopubMessage } from "../utils";
import { JupyterLab } from "@jupyterlab/application";
import { IRenderMimeRegistry, RenderMimeRegistry } from "@jupyterlab/rendermime";
import { Kernel } from "@jupyterlab/services";
import { CommandRegistry } from "@lumino/commands";
import { SplitPanel } from "@lumino/widgets";

jest.mock("@jupyterlab/application", () => {
    return {
        JupyterLab: jest.fn().mockImplementation(() => {
            const actual = jest.requireActual("@jupyterlab/application");
            return {
                ...actual,
                commands: new CommandRegistry(),
            };
        }),
    };
});
jest.mock("../../logger", () => {
    const WaldiezLogger = jest.requireActual("../../logger").WaldiezLogger;
    return {
        WaldiezLogger,
        getCodeToExecute: jest.fn(),
    };
});

const onStdin = jest.fn();
const onUpdate = jest.fn();
const onEnd = jest.fn();

const mockKernelConnectionSuccess = {
    requestExecute: jest.fn().mockReturnValue({
        onIOPub: jest.fn(),
        onReply: jest.fn(),
        onStdin: jest.fn(),
        done: Promise.resolve(),
        dispose: jest.fn(),
    }),
    status: "idle",
} as unknown as Kernel.IKernelConnection;

const mockKernelConnectionNoRequestExecute = {
    requestExecute: () => undefined,
    status: "idle",
} as unknown as Kernel.IKernelConnection;

const mockKernelConnectionError = {
    requestExecute: jest.fn().mockReturnValue({
        onIOPub: jest.fn(),
        onReply: jest.fn(),
        onStdin: jest.fn(),
        done: Promise.reject(new Error("Kernel execution failed")),
        dispose: jest.fn(),
    }),
    status: "idle",
} as unknown as Kernel.IKernelConnection;

const getRunner = (logger: WaldiezLogger) => {
    return new WaldiezStandardRunner({
        baseUrl: "http://localhost:8888",
        logger,
        onStdin,
        onUpdate,
        onEnd,
    });
};

const getTimelineData = () => {
    return {
        timeline: [
            {
                id: "1",
                type: "session",
                start: 0,
                end: 1000,
                duration: 1000,
                agent: "agent1",
                cost: 10,
                color: "blue",
                label: "Session 1",
            },
        ],
        cost_timeline: [
            {
                time: 500,
                cumulative_cost: 5,
                session_cost: 5,
                session_id: "session1",
            },
        ],
        summary: {
            total_sessions: 1,
            total_time: 1000,
            total_cost: 10,
            total_agents: 1,
            total_events: 1,
            total_tokens: 100,
            avg_cost_per_session: 10,
            compression_info: {
                gaps_compressed: 0,
                time_saved: 0,
            },
        },
        metadata: {
            time_range: [0, 1000],
            cost_range: [0, 10],
            colors: { agent1: "blue" },
        },
        agents: [
            {
                name: "agent1",
                class: "user_proxy",
                color: "blue",
            },
        ],
    };
};

describe("WaldiezStandardRunner", () => {
    let app: jest.Mocked<JupyterLab>;
    let rendermime: IRenderMimeRegistry;
    let logger: WaldiezLogger;

    beforeEach(() => {
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        rendermime = new RenderMimeRegistry();
        logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should be created", () => {
        const runner = getRunner(logger);
        expect(runner).toBeTruthy();
    });

    it("should run a waldiez file", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        expect(runner.running).toBe(true);
    });

    it("should handle kernel execution error with actual error object", async () => {
        const runner = getRunner(logger);
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const loggerErrorSpy = jest.spyOn(logger, "error");

        runner.run(mockKernelConnectionError, "path/to/file.waldiez");

        // Trigger the error
        try {
            await mockKernelConnectionError.requestExecute({
                code: "any",
                silent: true,
                stop_on_error: true,
            }).done;
        } catch (_) {
            // Error should be handled
        }
        expect(loggerErrorSpy).toHaveBeenCalledWith("Kernel execution failed");

        consoleErrorSpy.mockRestore();
        loggerErrorSpy.mockRestore();
    });

    it("should not run a waldiez file if the kernel does not support requestExecute", () => {
        const runner = getRunner(logger);

        runner.run(mockKernelConnectionNoRequestExecute, "path/to/file.waldiez");
        expect(runner.running).toBe(false);
    });

    it("should reset the runner", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        expect(runner.running).toBe(true);

        const disposeSpy = jest.fn();
        if (runner["_future"]) {
            runner["_future"].dispose = disposeSpy;
        }

        runner.reset();
        expect(runner.running).toBe(false);
        expect(disposeSpy).toHaveBeenCalled();
    });

    it("should handle stdin messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        expect(runner["_future"]).toBeDefined();

        runner["_requestId"] = "test-request-id";
        runner["_future"]!.onStdin(inputRequestMessage);

        expect(onStdin).toHaveBeenCalledWith({
            ...inputRequestMessage,
            metadata: { request_id: "test-request-id" },
        });
        expect(runner["_expectingUserInput"]).toBe(true);
    });

    it("should handle IOPub stream messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const msgContent = {
            type: "text",
            content: {
                content: [
                    {
                        type: "text",
                        text: "Hello, World",
                    },
                ],
                sender: "user",
                recipient: "assistant",
            },
        };
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(msgContent),
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner["_messages"][0].content as any).toEqual([
            {
                type: "text",
                text: "Hello, World",
            },
        ]);
    });

    it("should handle IOPub error messages", () => {
        const runner = getRunner(logger);
        const loggerLogSpy = jest.spyOn(logger, "log");

        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        runner["_future"]!.onIOPub(errorMsg);

        expect(loggerLogSpy).toHaveBeenCalledWith(errorMsg);
        expect(runner.running).toBe(false);

        loggerLogSpy.mockRestore();
    });

    it("should handle timeline messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        const timeline = getTimelineData();
        const timelineMsg = {
            type: "timeline",
            content: timeline,
        };
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(timelineMsg),
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner.getTimelineData()).toEqual(timeline);
    });

    it("should handle reply messages correctly", () => {
        const runner = getRunner(logger);
        const loggerErrorSpy = jest.spyOn(logger, "error");

        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        runner["_future"]!.onReply(executeReplyMessage);
        expect(loggerErrorSpy).not.toHaveBeenCalledWith(executeReplyMessage);

        const notOk = {
            ...executeReplyMessage,
            content: {
                status: "error" as const,
                ename: "Error",
                evalue: "An error occurred",
                execution_count: 1,
                traceback: [
                    "Traceback (most recent call last):",
                    '  File "<stdin>", line 1, in <module>',
                    "NameError: name 'x' is not defined",
                ],
            },
        };
        runner["_future"]!.onReply(notOk);
        expect(loggerErrorSpy).toHaveBeenCalledWith("error: [object Object]");
    });

    it("should filter and return previous messages correctly", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        runner["_messages"] = [
            {
                id: "1",
                content: "Step 1 completed",
                type: "text",
                timestamp: new Date().toISOString(),
            },
            {
                id: "2",
                content: "Step 2 completed",
                type: "text",
                timestamp: new Date().toISOString(),
            },
            {
                id: "3",
                content: "Input required",
                type: "input_request",
                request_id: "requestId",
                timestamp: new Date().toISOString(),
            },
        ];

        const previousMessages = runner.getPreviousMessages();
        expect(previousMessages.length).toEqual(3);
    });

    it("should get and set user participants", () => {
        const runner = getRunner(logger);
        expect(runner.getUserParticipants()).toEqual([]);

        runner["_userParticipants"] = ["user1", "user2"];
        expect(runner.getUserParticipants()).toEqual(["user1", "user2"]);
    });

    it("should handle input request messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const inputRequestMsg = {
            type: "input_request",
            request_id: "req-123",
            prompt: "Please enter a value",
            password: false,
        };

        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(inputRequestMsg),
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner["_expectingUserInput"]).toBe(true);
        expect(runner.requestId).toBe("req-123");
    });

    it("should handle text message after input request", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        // Set up expecting user input
        runner["_expectingUserInput"] = true;

        const textMsg = {
            type: "text",
            content: {
                sender: "user",
                recipient: "assistant",
                content: [{ type: "text", text: "User response" }],
            },
        };

        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(textMsg),
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner["_expectingUserInput"]).toBe(false);
    });

    it("should handle timeline messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const timelineMsg = {
            type: "timeline",
            content: {
                nodes: [{ id: "1", name: "Node 1" }],
                edges: [{ from: "1", to: "2" }],
                summary: "Timeline update",
            },
        };

        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(timelineMsg),
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        // expect(onTimelineData).toHaveBeenCalledWith(timelineMsg.content);
        expect(runner["_expectingUserInput"]).toBe(false);
    });

    it("should handle workflow execution failed message with JSON format", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const failedMessage = JSON.stringify({
            type: "print",
            data: "<Waldiez> - Workflow execution failed: Connection timeout\n",
        });
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: failedMessage,
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner["_messages"]).toContainEqual(
            expect.objectContaining({
                type: "system",
                id: "workflow-end",
                content: [{ type: "text", text: "Workflow execution failed: Connection timeout" }],
            }),
        );
    });

    it("should handle participants in messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const msgWithParticipants = {
            type: "print",
            data: JSON.stringify({
                participants: [
                    { name: "user1", humanInputMode: "ALWAYS", agentType: "user_proxy" },
                    { name: "assistant", humanInputMode: "NEVER", agentType: "assistant" },
                    { name: "user2", humanInputMode: "ALWAYS", agentType: "user_proxy" },
                ],
            }),
        };

        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(msgWithParticipants),
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner.getUserParticipants()).toEqual(["user1", "user2"]);
    });

    it("should handle duplicate participants", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        runner["_userParticipants"] = ["user1"];

        const msgWithParticipants = {
            type: "print",
            data: JSON.stringify({
                participants: [
                    { name: "user1", humanInputMode: "ALWAYS", agentType: "user_proxy" },
                    { name: "user2", humanInputMode: "ALWAYS", agentType: "user_proxy" },
                    { name: "user3", humanInputMode: "ALWAYS", agentType: "user_proxy" },
                    { name: "user2", humanInputMode: "ALWAYS", agentType: "user_proxy" },
                ],
            }),
        };

        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(msgWithParticipants),
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner.getUserParticipants()).toEqual(["user1", "user2", "user3"]);
    });

    it("should handle non-processable messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const invalidMessage = "Some random text that won't process";
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: invalidMessage,
            },
        };

        const initialMessageCount = runner["_messages"].length;
        runner["_future"]!.onIOPub(streamMsg);
        expect(runner["_messages"].length).toBe(initialMessageCount);
    });

    it("should handle stderr stream messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const stderrMsg = {
            ...iopubMessage,
            content: {
                name: "stderr" as const,
                text: "Error output",
            },
        };

        const loggerLogSpy = jest.spyOn(logger, "log");
        runner["_future"]!.onIOPub(stderrMsg);
        expect(loggerLogSpy).toHaveBeenCalledWith(stderrMsg);

        loggerLogSpy.mockRestore();
    });

    it("should handle messages when not running", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        // Stop the runner
        runner["_running"] = false;

        const textMsg = {
            type: "text",
            content: {
                sender: "user",
                recipient: "assistant",
                content: [{ type: "text", text: "Message after stop" }],
            },
        };

        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(textMsg),
            },
        };

        const initialMessageCount = runner["_messages"].length;
        runner["_future"]!.onIOPub(streamMsg);
        expect(runner["_messages"].length).toBe(initialMessageCount);
    });
});
