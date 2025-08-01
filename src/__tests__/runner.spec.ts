/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "../logger";
import { WaldiezRunner } from "../runner";
import { errorMsg, executeReplyMessage, inputRequestMessage, iopubMessage } from "./utils";
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
jest.mock("../logger", () => {
    const WaldiezLogger = jest.requireActual("../logger").WaldiezLogger;
    return {
        WaldiezLogger,
        getCodeToExecute: jest.fn(),
    };
});

const onStdin = jest.fn();
const onInputRequest = jest.fn();
const onMessagesUpdate = jest.fn();
const onTimelineData = jest.fn();
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

const mockKernelConnectionFail = {
    requestExecute: jest.fn().mockReturnValue({
        onIOPub: jest.fn(),
        onReply: jest.fn(),
        onStdin: jest.fn(),
        done: Promise.reject(),
        dispose: jest.fn(),
    }),
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

const getRunner = (logger: WaldiezLogger, includeTimelineCallback = false) => {
    return new WaldiezRunner({
        baseUrl: "http://localhost:8888",
        logger,
        onStdin,
        onInputRequest,
        onMessagesUpdate,
        onTimelineData: includeTimelineCallback ? onTimelineData : undefined,
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

describe("WaldiezRunner", () => {
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

    it("should not run a waldiez file if one is already running", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        expect(runner.running).toBe(true);
        const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        expect(consoleWarnSpy).toHaveBeenCalledWith("A waldiez file is already running");
        consoleWarnSpy.mockRestore();
    });

    it("should log an error if the kernel request fails", async () => {
        const runner = getRunner(logger);
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const loggerLogSpy = jest.spyOn(logger, "log");

        runner.run(mockKernelConnectionFail, "path/to/file.waldiez");
        expect(runner.running).toBe(true);

        // Trigger the error
        try {
            await mockKernelConnectionFail.requestExecute({
                code: "any",
                silent: true,
                stop_on_error: true,
            }).done;
        } catch (_) {
            // Error should be handled
        }

        expect(consoleErrorSpy).toHaveBeenCalledWith("Error while running the waldiez file", undefined);
        expect(loggerLogSpy).toHaveBeenCalledWith(
            'Error: {"channel":"iopub","content":{"name":"stderr","text":"Failed to run the waldiez file"},"header":{"msg_type":"stream"},"metadata":{}}',
        );
        expect(runner.running).toBe(false);

        consoleErrorSpy.mockRestore();
        loggerLogSpy.mockRestore();
    });

    it("should handle kernel execution error with actual error object", async () => {
        const runner = getRunner(logger);
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const loggerLogSpy = jest.spyOn(logger, "log");

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

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Error while running the waldiez file",
            expect.any(Error),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith("Error: {}");

        consoleErrorSpy.mockRestore();
        loggerLogSpy.mockRestore();
    });

    it("should not run a waldiez file if the kernel does not support requestExecute", () => {
        const runner = getRunner(logger);
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        runner.run(mockKernelConnectionNoRequestExecute, "path/to/file.waldiez");
        expect(runner.running).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to create a future for the waldiez file");

        consoleErrorSpy.mockRestore();
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
        const runner = getRunner(logger, true);
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
        const loggerLogSpy = jest.spyOn(logger, "log");

        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        runner["_future"]!.onReply(executeReplyMessage);
        expect(loggerLogSpy).not.toHaveBeenCalledWith(executeReplyMessage);

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
        expect(loggerLogSpy).toHaveBeenCalledWith("error: [object Object]");
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

    it("should handle workflow done message", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const doneMessage = "<Waldiez> - Done running the flow.";
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: doneMessage,
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(runner.running).toBe(false);
        expect(onEnd).toHaveBeenCalled();
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
        expect(onInputRequest).toHaveBeenCalledWith("req-123");
        expect(runner["_expectingUserInput"]).toBe(true);
        expect(runner["_requestId"]).toBe("req-123");
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
        const runner = getRunner(logger, true);
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

    it("should handle workflow ending messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        const data = {
            content: {
                timeline: [] as any[],
                cost_timeline: [] as any[],
                summary: {} as any,
                metadata: {} as any,
                agents: [] as any[],
            },
        };
        runner.setTimelineData(data.content);
        const endingMessage = "<Waldiez> - Workflow finished";
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: endingMessage,
            },
        };
        runner["_future"]!.onIOPub(streamMsg);
        expect(runner.running).toBe(false);
        expect(onEnd).toHaveBeenCalled();
    });

    it("should handle workflow stopped by user message", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");

        const stoppedMessage = "<Waldiez> - Workflow stopped by user";
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: stoppedMessage,
            },
        };

        runner["_future"]!.onIOPub(streamMsg);
        expect(onEnd).toHaveBeenCalled();
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

/*
 timeline: WaldiezTimelineItem[];
    cost_timeline: WaldiezTimelineCostPoint[];
    summary: {
        total_sessions: number;
        total_time: number;
        total_cost: number;
        total_agents: number;
        total_events: number;
        total_tokens: number;
        avg_cost_per_session: number;
        compression_info: {
            gaps_compressed: number;
            time_saved: number;
        };
    };
    metadata: {
        time_range: [number, number];
        cost_range: [number, number];
        colors?: Record<string, string>;
    };
    agents: WaldiezTimelineAgentInfo[];


    export declare type WaldiezTimelineAgentInfo = {
    name: string;
    class: string;
    color: string;
};

export declare type WaldiezTimelineCostPoint = {
    time: number;
    cumulative_cost: number;
    session_cost: number;
    session_id: number | string;
};

export declare type WaldiezTimelineItem = {
    id: string;
    type: "session" | "gap";
    start: number;
    end: number;
    duration: number;
    agent?: string;
    cost?: number;
    color: string;
    label: string;
    gap_type?: string;
    real_duration?: number;
    compressed?: boolean;
    prompt_tokens?: number;
    completion_tokens?: number;
    tokens?: number;
    agent_class?: string;
    is_cached?: boolean;
    llm_model?: string;
    y_position?: number;
    session_id?: string;
    real_start_time?: string;
};
*/
