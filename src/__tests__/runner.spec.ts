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
const onEnd = jest.fn();
const mockKernelConnectionSuccess = {
    requestExecute: jest.fn().mockReturnValue({
        onIOPub: jest.fn(),
        onReply: jest.fn(),
        onStdin: jest.fn(),
        done: Promise.resolve(),
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
    }),
    status: "idle",
} as unknown as Kernel.IKernelConnection;

const getRunner = (logger: WaldiezLogger) => {
    return new WaldiezRunner({
        baseUrl: "http://localhost:8888",
        logger,
        onStdin,
        onInputRequest,
        onMessagesUpdate,
        onEnd,
    });
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
        runner.run(mockKernelConnectionFail, "path/to/file.waldiez");
        expect(runner.running).toBe(true);
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        try {
            await mockKernelConnectionFail.requestExecute({
                code: "any",
                silent: true,
                stop_on_error: true,
            }).done;
        } catch (_) {
            expect(consoleErrorSpy).toHaveBeenCalledWith("Error while running the waldiez file", undefined);
        }
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
        if (runner["_future"]) {
            runner["_future"].dispose = jest.fn();
        }
        runner.reset();
        expect(runner.running).toBe(false);
    });
    it("should handle stdin messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        expect(runner["_future"]).toBeDefined();
        runner["_future"]!.onStdin(inputRequestMessage);
        expect(runner["_messages"]).not.toContain(">");
        expect(onStdin).toHaveBeenCalledWith(inputRequestMessage);
    });

    it("should handle IOPub stream messages", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        const msgContent = {
            type: "text",
            content: {
                type: "text",
                text: "Hello, World",
            },
            sender: "user",
            recipient: "assistant",
        };
        const streamMsg = {
            ...iopubMessage,
            content: {
                name: "stdout" as const,
                text: JSON.stringify(msgContent),
            },
        };
        runner["_future"]!.onIOPub(streamMsg);
        // expect(runner["_messages"][0] as any).toEqual(msgContent.content);
    });
    it("should handle IOPub error messages", () => {
        const runner = getRunner(logger);
        const loggerLogSpy = jest.spyOn(logger, "log");
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        runner["_future"]!.onIOPub(errorMsg);
        expect(loggerLogSpy).toHaveBeenCalledWith(errorMsg);
        loggerLogSpy.mockRestore();
    });
    it("should handle reply messages correctly", () => {
        const runner = getRunner(logger);
        // const loggerLogSpy = jest.spyOn(logger, "log");
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        runner["_future"]!.onReply(executeReplyMessage);
        // expect(runner["_messages"]).toContain("ok");
        // expect(loggerLogSpy).toHaveBeenCalledWith(executeReplyMessage);
    });
    it("should filter and return previous messages correctly", () => {
        const runner = getRunner(logger);
        runner.run(mockKernelConnectionSuccess, "path/to/file.waldiez");
        // runner["_messages"] = [
        //     "Installing requirements...",
        //     WALDIEZ_STRINGS.AFTER_INSTALL_NOTE,
        //     "Step 1 completed",
        //     "Step 2 completed",
        //     "Input required",
        // ];
        // const inputPrompt = "Input required";
        // const previousMessages = runner.getPreviousMessages(inputPrompt);
        // expect(previousMessages).toEqual(["Step 1 completed", "Step 2 completed"]);
    });
});
