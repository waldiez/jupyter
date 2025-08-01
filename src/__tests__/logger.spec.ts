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
    });
    afterEach(() => {
        jest.clearAllMocks();
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
});
