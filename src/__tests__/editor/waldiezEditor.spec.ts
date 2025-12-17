/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { FACTORY_NAME, WALDIEZ_FILE_TYPE } from "../../constants";
import { WaldiezEditor, WaldiezExecutionManager } from "../../editor";
import { WaldiezEditorFactory } from "../../factory";
import { editorContext, patchServerConnection } from "../utils";
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

jest.mock("@jupyterlab/apputils", () => {
    const actual = jest.requireActual("@jupyterlab/apputils");
    return {
        ...actual,
        showErrorMessage: jest.fn(),
    };
});

jest.mock("../../runner/standardRunner", () => {
    return {
        WaldiezStandardRunner: jest.fn().mockImplementation(() => ({
            getPreviousMessages: jest.fn(() => []),
            run: jest.fn(),
            reset: jest.fn(),
            getUserParticipants: jest.fn(() => []),
            getTimelineData: jest.fn(() => undefined),
            setTimelineData: jest.fn(),
            get requestId() {
                return "test-request-id";
            },
        })),
    };
});

jest.mock("../../runner/stepRunner", () => {
    return {
        WaldiezStepRunner: jest.fn().mockImplementation(() => ({
            start: jest.fn(),
            reset: jest.fn(),
            responded: jest.fn(),
            get requestId() {
                return "test-request-id";
            },
        })),
    };
});

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
        editor.dispose();
    });

    it("should handle session status change", async () => {
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor["_logger"], "log");

        // Access the kernel manager and trigger a status change
        const kernelManager = editor["_kernelManager"];
        kernelManager["_onSessionStatusChanged"](editor.context.sessionContext, "idle");

        expect(logSpy).toHaveBeenCalledWith({
            data: "Kernel status changed to idle",
            level: "debug",
            type: "text",
        });

        editor.dispose();
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

        await editor["_kernelManager"].restart();
        expect(restartSpy).toHaveBeenCalled();

        editor.dispose();
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

        await editor["_kernelManager"].interrupt();
        expect(interruptSpy).toHaveBeenCalled();

        editor.dispose();
    });

    it("should handle save", async () => {
        const editor = await getEditor();
        const { context } = editor;
        const model = {
            ...context.model,
            fromString: jest.fn(),
        };
        Object.assign(editor.context.model, model);
        const fromStringSpy = jest.spyOn(model, "fromString");
        const saveSpy = jest.spyOn(editor.context, "save");

        await editor["_onSave"]("new content");
        expect(fromStringSpy).toHaveBeenCalledWith("new content");
        expect(saveSpy).toHaveBeenCalled();

        editor.dispose();
    });

    it("should handle upload catching error", async () => {
        patchServerConnection("", true);
        const editor = await getEditor();
        const files = [new File([""], "file.txt")];
        const results = await editor["_onUpload"](files);
        expect(results).toEqual([]);

        editor.dispose();
    });

    it("should handle upload", async () => {
        patchServerConnection('{"path": "path"}', false);
        const editor = await getEditor();
        const files = [new File([""], "file.txt")];
        const path = await editor["_onUpload"](files);
        expect(path).toEqual(["path"]);

        editor.dispose();
    });

    it("should handle run", async () => {
        patchServerConnection('{"path": "path"}', false);
        const editor = await getEditor();
        Object.assign(editor.context, {
            save: jest.fn().mockResolvedValue(true),
        });

        // Mock kernel
        editor["_kernelManager"]["_sessionContext"].session = {
            kernel: { status: "idle" },
        } as any;
        const executeSpy = jest.spyOn(editor["_executionManager"], "executeStandard").mockResolvedValue();

        await editor["_onRun"]("content");
        expect(executeSpy).toHaveBeenCalled();

        editor.dispose();
    });

    it("should handle run catching error", async () => {
        patchServerConnection("", true);
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor["_logger"], "log");

        // Mock kernel
        editor["_kernelManager"]["_sessionContext"].session = {
            kernel: { status: "idle" },
        } as any;
        const executeSpy = jest
            .spyOn(editor["_executionManager"], "executeStandard")
            .mockRejectedValue(new Error("Execution failed"));

        await editor["_onRun"]("content");
        expect(logSpy).toHaveBeenCalledWith({
            data: "Error executing flow: Execution failed",
            level: "error",
            type: "text",
        });
        expect(executeSpy).toHaveBeenCalled();
        editor.dispose();
    });

    it("should handle step run", async () => {
        patchServerConnection('{"path": "path"}', false);
        const editor = await getEditor();
        Object.assign(editor.context, {
            save: jest.fn().mockResolvedValue(true),
        });

        // Mock kernel
        editor["_kernelManager"]["_sessionContext"].session = {
            kernel: { status: "idle" },
        } as any;

        const executeSpy = jest.spyOn(editor["_executionManager"], "executeStepByStep").mockResolvedValue();

        await editor["_onStepRun"]("content");
        expect(executeSpy).toHaveBeenCalled();

        editor.dispose();
    });

    it("should handle step run catching error", async () => {
        patchServerConnection("", true);
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor["_logger"], "log");

        // Mock kernel
        editor["_kernelManager"]["_sessionContext"].session = {
            kernel: { status: "idle" },
        } as any;
        const executeSpy = jest
            .spyOn(editor["_executionManager"], "executeStepByStep")
            .mockRejectedValue(new Error("Step execution failed"));

        await editor["_onStepRun"]("content");
        expect(logSpy).toHaveBeenCalledWith({
            data: "Error executing flow: Step execution failed",
            level: "error",
            type: "text",
        });
        expect(executeSpy).toHaveBeenCalled();
        editor.dispose();
    });

    it("should handle no kernel error", async () => {
        const editor = await getEditor();
        // Mock no kernel
        editor["_kernelManager"]["_sessionContext"].session = {
            kernel: null,
        } as any;

        await editor["_onRun"]("content");
        // spy on apputils?
        const apputils = require("@jupyterlab/apputils");
        const showErrorMessageSpy = jest.spyOn(apputils, "showErrorMessage");

        expect(showErrorMessageSpy).toHaveBeenCalledWith(
            "No kernel",
            "Please start a kernel before running the workflow.",
        );
        editor.dispose();
    });
    it("should handle convert operation", async () => {
        patchServerConnection('{"success": true}', false);
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor["_logger"], "log");

        // Mock handleConvert
        const mockHandleConvert = jest.fn().mockResolvedValue(true);
        const originalModule = jest.requireActual("../../rest");
        jest.doMock("../../rest", () => ({
            ...originalModule,
            handleConvert: mockHandleConvert,
        }));

        await editor["_onConvert"]("flow content", "py");

        expect(logSpy).toHaveBeenCalledWith({
            data: "Exported to .py successfully",
            level: "info",
            type: "text",
        });
        expect(fileBrowserFactory.tracker.currentWidget?.model.refresh).toHaveBeenCalled();

        editor.dispose();
    });

    it("should handle convert error", async () => {
        const editor = await getEditor();

        patchServerConnection("Convert failed", true);
        const logSpy = jest.spyOn(editor["_logger"], "log");
        await editor["_onConvert"]("flow content", "ipynb");

        expect(logSpy).toHaveBeenCalledWith({
            data: "Error converting to .ipynb: Convert failed",
            level: "error",
            type: "text",
        });

        editor.dispose();
    });

    it("should dispose properly", async () => {
        const editor = await getEditor();
        const contentDisposeSpy = jest.spyOn(editor.content, "dispose");
        const loggerDisposeSpy = jest.spyOn(editor["_logger"], "dispose");
        const kernelManagerDisposeSpy = jest.spyOn(editor["_kernelManager"], "dispose");
        const executionManagerDisposeSpy = jest.spyOn(editor["_executionManager"], "dispose");

        editor.dispose();

        expect(contentDisposeSpy).toHaveBeenCalled();
        expect(loggerDisposeSpy).toHaveBeenCalled();
        expect(kernelManagerDisposeSpy).toHaveBeenCalled();
        expect(executionManagerDisposeSpy).toHaveBeenCalled();
    });

    it("should extract error messages correctly", async () => {
        const editor = await getEditor();

        expect(editor["_extractErrorMessage"](new Error("Test error"))).toBe("Test error");
        expect(editor["_extractErrorMessage"]("String error")).toBe("String error");
        expect(editor["_extractErrorMessage"](null)).toBe("Unknown error");
        expect(editor["_extractErrorMessage"](undefined)).toBe("Unknown error");
        expect(editor["_extractErrorMessage"]({ message: "Object error" })).toBe("Object error");

        editor.dispose();
    });

    it("should handle execution manager dependencies", async () => {
        const setDependenciesSpy = jest.fn();
        jest.spyOn(WaldiezExecutionManager.prototype, "setDependencies").mockImplementation(
            setDependenciesSpy,
        );

        const editor = await getEditor();

        expect(setDependenciesSpy).toHaveBeenCalledWith(
            editor.context.sessionContext,
            editor["_kernelManager"],
        );

        editor.dispose();
    });
    it("should set execution manager dependencies", async () => {
        const editor = await getEditor();

        // Test that dependencies are actually set by trying to use a handler
        const executionManager = editor["_executionManager"];
        expect(executionManager["_sessionContext"]).toBeDefined();
        expect(executionManager["_kernelManager"]).toBeDefined();

        editor.dispose();
    });

    it("should not save content when unchanged", async () => {
        const editor = await getEditor();
        const fromStringSpy = jest.spyOn(editor.context.model, "fromString");
        const saveSpy = jest.spyOn(editor.context, "save");
        const currentContent = editor.context.model.toString();

        await editor["_onSave"](currentContent);

        expect(fromStringSpy).not.toHaveBeenCalled();
        expect(saveSpy).not.toHaveBeenCalled();

        editor.dispose();
    });
});
