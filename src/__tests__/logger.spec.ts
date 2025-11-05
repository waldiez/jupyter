/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezLogger } from "../logger";
import {
    executeReplyMessage,
    executeRequestMessage,
    inputRequestMessage,
    iopubMessage,
    logMessage,
} from "./utils";
import { JupyterLab } from "@jupyterlab/application";
import { IRenderMimeRegistry, RenderMimeRegistry } from "@jupyterlab/rendermime";
import { CommandRegistry } from "@lumino/commands";
import { SplitPanel } from "@lumino/widgets";

jest.mock("@jupyterlab/settingregistry");
jest.mock("@jupyterlab/codeeditor");
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
describe("WaldiezLogger", () => {
    let app: jest.Mocked<JupyterLab>;
    let rendermime: IRenderMimeRegistry;

    beforeEach(() => {
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        rendermime = new RenderMimeRegistry();
        if (typeof document.execCommand !== "function") {
            document.execCommand = jest.fn().mockReturnValue(true);
        }
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        document.body.innerHTML = "";
    });
    it("should be created", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        expect(logger).toBeTruthy();
        expect(logger.widget).toBeDefined();
    });
    it("should log a message", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log({ ...logMessage, level: "info" });
    });
    it("should log an error message", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log({ ...logMessage, level: "error" });
    });
    it("should log an iopub message", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log(iopubMessage);
    });
    it("should log an input request message", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log(inputRequestMessage);
    });
    it("should log an execute reply message", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log(executeReplyMessage);
    });
    it("should log an execute request message", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log(executeRequestMessage);
    });
    it("should clear the log", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.clear();
    });
    it("should toggle the log", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        expect(logger.isVisible).toBe(false);
        logger.toggle();
        expect(logger.isVisible).toBe(true);
        logger.toggle();
        expect(logger.isVisible).toBe(false);
    });
    it("should log a string message", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log("simple string message");
    });

    it("should log an object without header", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        logger.log({ some: "object", without: "header" } as any);
    });

    it("should handle stderr with warning", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        const stderrWarning = {
            ...iopubMessage,
            content: {
                name: "stderr" as const,
                text: "Warning: this is a warning message",
            },
        };
        logger.log(stderrWarning);
    });

    it("should handle stderr with error", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        const stderrError = {
            ...iopubMessage,
            content: {
                name: "stderr" as const,
                text: "Error: this is an error message",
            },
        };
        logger.log(stderrError);
    });

    it("should dispose properly", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });

        const hasCommandSpy = jest.spyOn(app.commands, "hasCommand").mockReturnValue(true);
        const notifyCommandChangedSpy = jest.spyOn(app.commands, "notifyCommandChanged");

        logger.dispose();

        expect(hasCommandSpy).toHaveBeenCalled();
        expect(notifyCommandChangedSpy).toHaveBeenCalled();
    });

    it("should handle _scrollToBottom with no logs", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });

        // Mock querySelectorAll to return null
        jest.spyOn(logger["_logConsole"].node, "querySelectorAll").mockReturnValue(null as any);

        logger["_scrollToBottom"]();
    });
    it("parses log DOM into entries (timestamp + fallback)", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });

        // Populate two fake log lines
        const host = logger["widget"].content.node; // LogConsolePanel node
        host.innerHTML = `
      <div class="jp-OutputArea-child">12:34:56 Task started</div>
      <div class="jp-OutputArea-child">no timestamp here</div>
    `;

        const entries = logger["_collectLogEntries"]() as any[];
        expect(entries).toHaveLength(2);
        expect(entries[0].timestamp).toBe("12:34:56");
        expect(entries[0].data).toBe("Task started");
        expect(typeof entries[1].timestamp).toBe("string"); // ISO fallback
        expect(entries[1].data).toBe("no timestamp here");
    });

    it("serializes entries to JSONL with trailing newline", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });

        const jsonl = logger["_entriesToJsonl"]([
            { timestamp: "00:00:01", data: "a" },
            { timestamp: "00:00:02", data: "b" },
        ]);
        expect(jsonl).toBe('{"timestamp":"00:00:01","data":"a"}\n{"timestamp":"00:00:02","data":"b"}\n');
    });

    it("makes a timestamped filename", () => {
        jest.useFakeTimers().setSystemTime(new Date(2025, 10, 5, 9, 30, 15));
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        const name = logger["_makeDownloadFilename"]();
        expect(name).toBe("waldiez-logs-2025-11-05-09-30-15.jsonl");
    });

    it("scrolls to bottom when logs exist", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        const host = logger["widget"].content.node;
        host.innerHTML = `
      <div class="jp-OutputArea-child"></div>
      <div class="jp-OutputArea-child" id="last"></div>
    `;
        const last = host.querySelector("#last") as any;
        last.scrollIntoView = jest.fn();

        logger["_scrollToBottom"]();
        expect(last.scrollIntoView).toHaveBeenCalled();
    });

    it("registers commands and executes copy/download/clear", async () => {
        const copySpy = jest.spyOn(WaldiezLogger.prototype as any, "_copyLogs");
        const dlSpy = jest.spyOn(WaldiezLogger.prototype as any, "_downloadLogs");
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        const host = logger["widget"].content.node;
        host.innerHTML = '<div class="jp-OutputArea-child">12:00:00 hello</div>';

        const clearSpy = jest.spyOn((logger as any)["_getLogger"](), "clear");

        await app.commands.execute((logger as any)["_copyLogsCommandId"]);
        await app.commands.execute((logger as any)["_downloadLogsCommandId"]);
        await app.commands.execute((logger as any)["_logConsoleClearCommandId"]);

        expect(copySpy).toHaveBeenCalled();
        expect(dlSpy).toHaveBeenCalled();
        expect(clearSpy).toHaveBeenCalled();
    });

    it("download: standard anchor + objectURL path", async () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });
        const host = logger["widget"].content.node;
        host.innerHTML = '<div class="jp-OutputArea-child">12:00:00 x</div>';

        const revoke = jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const create = jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");

        const a = document.createElement("a");
        const click = jest.fn();
        Object.defineProperty(a, "click", { value: click });
        jest.spyOn(document, "createElement").mockReturnValue(a);
        jest.spyOn(document.body, "appendChild").mockImplementation(() => a);
        jest.spyOn(a, "remove").mockImplementation(() => {});

        (navigator as any).msSaveOrOpenBlob = undefined;

        await (logger as any)._downloadLogs();

        expect(create).toHaveBeenCalled();
        expect(click).toHaveBeenCalled();
        jest.runOnlyPendingTimers();

        const createdUrl = create.mock.results[0].value as string;
        expect(revoke).toHaveBeenCalledWith(createdUrl);

        jest.useRealTimers();
        revoke.mockRestore();
        create.mockRestore();
    });
    it("download: IE/Edge msSaveOrOpenBlob path", async () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });

        const host = logger["widget"].content.node;
        host.innerHTML = '<div class="jp-OutputArea-child">12:00:00 y</div>';

        const msSave = jest.fn();
        (navigator as any).msSaveOrOpenBlob = msSave;

        const create = jest.spyOn(URL, "createObjectURL");
        await (logger as any)._downloadLogs();

        expect(msSave).toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();

        create.mockRestore();
        (navigator as any).msSaveOrOpenBlob = undefined;
    });

    it("logData strips ANSI sequences before logging", () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: "editorId",
            panel: new SplitPanel(),
        });

        // Replace underlying logger with a spy
        const fakeLogger = { log: jest.fn(), clear: jest.fn(), level: "info" } as any;
        jest.spyOn(logger as any, "_getLogger").mockReturnValue(fakeLogger);

        // Send colored text
        (logger as any)["_logData"]({
            // cspell: disable-next-line
            data: "\u001b[31mred\u001b[0m",
            level: "info",
            type: "text",
        });

        expect(fakeLogger.log).toHaveBeenCalledWith({
            data: "red",
            level: "info",
            type: "text",
        });
    });
});
