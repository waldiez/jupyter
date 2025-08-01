/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { FACTORY_NAME, WALDIEZ_FILE_TYPE } from "../constants";
import { WaldiezEditor } from "../editor";
import { WaldiezEditorFactory } from "../factory";
import { editorContext, mockFetch } from "./utils";
import { JupyterLab } from "@jupyterlab/application";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import { IRenderMimeRegistry, RenderMimeRegistry } from "@jupyterlab/rendermime";
import { ISettingRegistry, SettingRegistry } from "@jupyterlab/settingregistry";
import { CommandRegistry } from "@lumino/commands";

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
jest.mock("../runner", () => {
    return {
        WaldiezRunner: jest.fn().mockImplementation(() => ({
            getPreviousMessages: jest.fn(),
            run: jest.fn(),
            reset: jest.fn(),
            getUserParticipants: jest.fn(),
            getTimelineData: jest.fn(),
            setTimelineData: jest.fn(),
            timelineData: undefined,
        })),
    };
});

const patchServerConnection = (responseText: string, error: boolean) => {
    mockFetch(responseText, error);
    jest.mock("@jupyterlab/services", () => {
        return {
            ServerConnection: {
                makeRequest: jest.fn().mockResolvedValue({
                    text: jest.fn().mockResolvedValue(responseText),
                }),
            },
        };
    });
};
jest.mock("@jupyterlab/settingregistry", () => {
    return {
        SettingRegistry: jest.fn().mockImplementation(() => ({
            get: jest.fn().mockResolvedValue({ composite: true }),
        })),
    };
});

jest.mock("@jupyterlab/codeeditor");

describe("WaldiezEditor", () => {
    let app: jest.Mocked<JupyterLab>;
    let settingRegistry: ISettingRegistry;
    let rendermime: IRenderMimeRegistry;
    let editorServices: IEditorServices;
    let fileBrowserFactory: IFileBrowserFactory;
    beforeEach(() => {
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        settingRegistry = new SettingRegistry({
            connector: null as any,
        }) as ISettingRegistry;
        rendermime = new RenderMimeRegistry();
        editorServices = {} as IEditorServices;
        fileBrowserFactory = {
            tracker: {
                currentWidget: {
                    model: {
                        refresh: jest.fn().mockResolvedValue(true),
                    },
                },
            },
        } as any;
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    const getEditor: () => Promise<WaldiezEditor> = async () => {
        const factory = new WaldiezEditorFactory({
            commands: app.commands,
            rendermime,
            fileBrowserFactory,
            editorServices,
            settingRegistry,
            name: FACTORY_NAME,
            fileTypes: [WALDIEZ_FILE_TYPE],
        });
        const editor = factory.createNew(editorContext);
        await editor.revealed;
        return editor;
    };
    it("should add commands on initialization", async () => {
        const addCommandSpy = jest.spyOn(app.commands, "addCommand");
        const editor = await getEditor();
        expect(editor).toBeTruthy();
        expect(addCommandSpy).toHaveBeenCalled();
    });

    it("should handle session status change", async () => {
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor["_logger"], "log");
        editor["_onSessionStatusChanged"](editor.context.sessionContext, "idle");
        expect(logSpy).toHaveBeenCalledWith({
            data: "Kernel status changed to idle",
            level: "debug",
            type: "text",
        });
    });

    it("should restart kernel on command", async () => {
        const editor = await getEditor();
        const { context } = editor;
        const restartSpy = jest.fn();
        context.sessionContext.session = {
            kernel: {
                restart: function () {
                    restartSpy();
                    return Promise.resolve();
                },
            },
        } as any;
        editor["_onRestartKernel"]();
        expect(restartSpy).toHaveBeenCalled();
    });

    it("should interrupt kernel on command", async () => {
        const editor = await getEditor();
        const { context } = editor;
        const interruptSpy = jest.fn();
        context.sessionContext.session = {
            kernel: {
                interrupt: function () {
                    interruptSpy();
                    return Promise.resolve();
                },
            },
        } as any;
        editor["_onInterruptKernel"]();
        expect(interruptSpy).toHaveBeenCalled();
    });

    it("should handle content change", async () => {
        const editor = await getEditor();
        const { context } = editor;
        const model = {
            ...context.model,
            fromString: jest.fn(),
        };
        Object.assign(editor.context.model, model);
        const fromStringSpy = jest.spyOn(model, "fromString");
        await editor["_onContentChanged"]("new content");
        expect(fromStringSpy).toHaveBeenCalledWith("new content");
    });

    it("should handle upload catching error", async () => {
        patchServerConnection("", true);
        const editor = await getEditor();
        const uploadSpy = jest.spyOn(editor as any, "onUpload");
        const files = [new File([""], "file.txt")];
        const results = await editor["onUpload"](files);
        expect(uploadSpy).toHaveBeenCalledWith(files);
        expect(results).toEqual([]);
    });

    it("should handle upload", async () => {
        patchServerConnection('{"path": "path"}', false);
        const editor = await getEditor();
        const files = [new File([""], "file.txt")];
        const path = await editor["onUpload"](files);
        expect(path).toEqual(["path"]);
    });

    it("should handle run", async () => {
        patchServerConnection('{"path": "path"}', false);
        const editor = await getEditor();
        Object.assign(editor.context, {
            save: jest.fn().mockResolvedValue(true),
        });
        const runSpy = jest.spyOn(editor["_runner"], "run");
        editor["_onRun"]("content");
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        expect(runSpy).toHaveBeenCalled();
    });

    it("should handle run catching error", async () => {
        patchServerConnection("", true);
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor["_logger"], "log");
        editor["_onRun"]("content");
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        expect(logSpy).toHaveBeenCalled();
    });
    it("should handle stdin", async () => {
        const editor = await getEditor();
        editor["_inputRequestId"] = "requestId";
        const logSpy = jest.spyOn(editor["_logger"], "log");
        editor["_onStdin"]({
            content: { prompt: "prompt", password: false },
            metadata: {
                requestId: "requestId",
            },
        } as any);
        expect(logSpy).toHaveBeenCalledWith({
            data: "prompt",
            level: "warning",
            type: "text",
        });
    });
    it("should handle serve monaco setting", async () => {
        const editor = await getEditor();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        const result = await editor["_getServeMonacoSetting"]();
        expect(result).not.toBeNull();
        expect(result).toBe("/static/vs");
    });
    it("should dispose", async () => {
        const editor = await getEditor();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        const disposeSpy = jest.spyOn(editor, "dispose");
        editor.dispose();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        expect(disposeSpy).toHaveBeenCalled();
    });

    it("should handle onEnd method", async () => {
        const editor = await getEditor();
        const chatEmitSpy = jest.spyOn(editor["_chat"], "emit");

        // Mock runner methods
        editor["_runner"].getPreviousMessages = jest
            .fn()
            .mockReturnValue([
                { id: "1", content: "test message", type: "text", timestamp: new Date().toISOString() },
            ]);
        editor["_runner"].getTimelineData = jest.fn().mockReturnValue({
            nodes: [],
            edges: [],
            summary: "test timeline",
        });
        editor["_runner"].getUserParticipants = jest.fn().mockReturnValue(["user1"]);

        // Call the private method
        editor["_onEnd"]();

        expect(chatEmitSpy).toHaveBeenCalledWith({
            showUI: false,
            messages: [{ id: "1", content: "test message", type: "text", timestamp: expect.any(String) }],
            timeline: { nodes: [], edges: [], summary: "test timeline" },
            userParticipants: ["user1"],
            activeRequest: undefined,
        });
    });

    it("should handle messages update with input request", async () => {
        const editor = await getEditor();
        const chatEmitSpy = jest.spyOn(editor["_chat"], "emit");

        const mockMessages = [
            {
                id: "1",
                content: "test",
                type: "input_request",
                timestamp: new Date().toISOString(),
                request_id: "req-123",
            },
        ];

        editor["_runner"].getPreviousMessages = jest.fn().mockReturnValue(mockMessages);
        editor["_runner"].getUserParticipants = jest.fn().mockReturnValue(["user1"]);
        editor["_inputRequestId"] = "current-req-id";
        editor["_stdinRequest"] = {
            content: { prompt: "Enter value: ", password: true },
        } as any;

        // Call the method with input request = true
        editor["_onMessagesUpdate"](true);

        expect(chatEmitSpy).toHaveBeenCalledWith({
            showUI: true,
            messages: mockMessages,
            timeline: undefined,
            userParticipants: ["user1"],
            activeRequest: {
                request_id: "current-req-id",
                prompt: "Enter value: ",
                password: true,
            },
            handlers: {
                onUserInput: expect.any(Function),
                onInterrupt: expect.any(Function),
                onClose: expect.any(Function),
            },
        });
    });

    it("should handle timeline data", async () => {
        const editor = await getEditor();
        const chatEmitSpy = jest.spyOn(editor["_chat"], "emit");

        const timelineData = {
            timeline: [] as any[],
            cost_timeline: [] as any[],
            summary: {} as any,
            metadata: {} as any,
            agents: [] as any[],
        };

        editor["_runner"].getPreviousMessages = jest.fn().mockReturnValue([]);
        editor["_runner"].getUserParticipants = jest.fn().mockReturnValue([]);

        // Call the method
        editor["_onTimelineData"](timelineData);

        expect(chatEmitSpy).toHaveBeenCalledWith({
            showUI: false,
            messages: [],
            timeline: timelineData,
            userParticipants: [],
            activeRequest: undefined,
            handlers: {
                onUserInput: expect.any(Function),
                onClose: expect.any(Function),
            },
        });
    });

    // Test for _getRequestIdFromPreviousMessages method (around line 515-520)
    it("should get request ID from previous messages", async () => {
        const editor = await getEditor();

        const messagesWithRequest = [
            { id: "1", content: "text", type: "text", timestamp: new Date().toISOString() },
            {
                id: "2",
                content: "input",
                type: "input_request",
                timestamp: new Date().toISOString(),
                request_id: "found-req-id",
            },
        ];

        const result = editor["_getRequestIdFromPreviousMessages"](messagesWithRequest as any);
        expect(result).toBe("found-req-id");

        // Test when no input request found
        const messagesWithoutRequest = [
            { id: "1", content: "text", type: "text", timestamp: new Date().toISOString() },
        ];

        const resultUnknown = editor["_getRequestIdFromPreviousMessages"](messagesWithoutRequest as any);
        expect(resultUnknown).toBe("<unknown>");
    });
    it("should handle convert operation", async () => {
        const editor = await getEditor();
        const handleConvertMock = jest.fn().mockResolvedValue(true);
        const originalHandleConvert = require("../rest").handleConvert;
        require("../rest").handleConvert = handleConvertMock;

        const logSpy = jest.spyOn(editor["_logger"], "log");

        // Call the method
        await editor["_onConvert"]("flow content", "py");

        expect(handleConvertMock).toHaveBeenCalledWith(editor.context.path, "py");
        expect(logSpy).toHaveBeenCalledWith({
            data: "Exported to .py successfully",
            level: "info",
            type: "text",
        });
        expect(fileBrowserFactory.tracker.currentWidget?.model.refresh).toHaveBeenCalled();

        // Restore original
        require("../rest").handleConvert = originalHandleConvert;
    });

    // Test convert error handling
    it("should handle convert error", async () => {
        const editor = await getEditor();

        // Mock handleConvert to reject
        const handleConvertMock = jest.fn().mockRejectedValue(new Error("Convert failed"));
        const originalHandleConvert = require("../rest").handleConvert;
        require("../rest").handleConvert = handleConvertMock;

        const logSpy = jest.spyOn(editor["_logger"], "log");

        // Call the method (don't await since it returns void)
        editor["_onConvert"]("flow content", "ipynb");

        // Wait for the promise to reject and the catch block to execute
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(logSpy).toHaveBeenCalledWith({
            data: "Error converting to .ipynb: Error: Convert failed",
            level: "error",
            type: "text",
        });

        // Restore original
        require("../rest").handleConvert = originalHandleConvert;
    });
    it("should store request ID on input request", async () => {
        const editor = await getEditor();

        editor["_onInputRequest"]("req-123");

        expect(editor["_inputRequestId"]).toBe("req-123");
    });
    /*
        private _onUserInput(userInput: WaldiezChatUserInput): void {
            if (this._stdinRequest) {
                this._logger.log({
                    data: JSON.stringify(userInput),
                    level: "info",
                    type: "text",
                });
                this.context.sessionContext.session?.kernel?.sendInputReply(
                    { value: JSON.stringify(userInput), status: "ok" },
                    this._stdinRequest.parent_header as any,
                );
                this._stdinRequest = null;
            }
            // this._chat.emit(undefined);
        }
            */
    it("should handle user input", async () => {
        const editor = await getEditor();
        const sendInputReplyMock = jest.fn();
        editor.context.sessionContext.session = {
            kernel: {
                sendInputReply: sendInputReplyMock,
            },
        } as any;

        editor["_stdinRequest"] = {
            parent_header: { msg_id: "msg-123" },
        } as any;

        const userInput = {
            type: "input_response" as const,
            timestamp: Date.now(),
            data: "test input",
        };
        editor["_onUserInput"](userInput as any);

        expect(sendInputReplyMock).toHaveBeenCalledWith(
            {
                status: "ok",
                value: JSON.stringify(userInput),
            },
            { msg_id: "msg-123" },
        );
        expect(editor["_stdinRequest"]).toBeNull();
    });
});
