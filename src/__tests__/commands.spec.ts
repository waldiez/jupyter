/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { CommandIDs, handleWaldiezCommands } from "../commands";
import { WaldiezEditor } from "../editor";
import { WaldiezEditorFactory } from "../factory";
import { mockFetch, patchServerConnection } from "./utils";
import { JupyterFrontEnd, JupyterLab } from "@jupyterlab/application";
import { WidgetTracker } from "@jupyterlab/apputils";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import { IMainMenu, MainMenu } from "@jupyterlab/mainmenu";

// Mock SessionContextDialogs
jest.mock("@jupyterlab/apputils", () => {
    const actual = jest.requireActual("@jupyterlab/apputils");
    return {
        ...actual,
        SessionContextDialogs: jest.fn().mockImplementation(() => ({
            selectKernel: jest.fn().mockResolvedValue(true),
        })),
    };
});

// Mock handleExport
jest.mock("../rest", () => ({
    handleExport: jest.fn().mockResolvedValue(true),
}));

describe("Waldiez Commands", () => {
    let app: JupyterFrontEnd;
    let tracker: WidgetTracker<WaldiezEditor>;
    let fileBrowserFactory: IFileBrowserFactory;
    let widgetFactory: WaldiezEditorFactory;
    let mainMenu: IMainMenu;

    beforeEach(() => {
        mockFetch('{"composite": true}', false);
        patchServerConnection('{"composite": true}', false);

        // Create a fresh app instance with new CommandRegistry each time
        const mockShell = {
            add: jest.fn(),
            activateById: jest.fn(),
            get currentWidget() {
                return tracker.currentWidget;
            },
        };

        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        (app as any).shell = mockShell;
        // Create a fresh command registry to avoid "already registered" errors
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        (app as any).commands = new (require("@lumino/commands").CommandRegistry)();

        tracker = {} as WidgetTracker<WaldiezEditor>;
        fileBrowserFactory = {
            tracker: {
                currentWidget: {
                    model: {
                        path: "path/to/file.waldiez",
                        refresh: jest.fn(),
                    },
                    selectedItems: () => [
                        {
                            path: "path/to/file.waldiez",
                            name: "file.waldiez",
                        },
                    ],
                },
            },
        } as unknown as IFileBrowserFactory;
        widgetFactory = { name: "waldiez-factory" } as WaldiezEditorFactory;
        mainMenu = new MainMenu(app.commands);
    });

    afterEach(() => {
        jest.clearAllMocks();
        // unregister all commands to avoid conflicts in subsequent tests
    });

    it("should register commands", async () => {
        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);
        expect(app.commands.hasCommand(CommandIDs.createNew)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.openWaldiez)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.exportToPython)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.exportToJupyter)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.interruptKernel)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.restartKernel)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.changeKernel)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.shutdownKernel)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.reconnectToKernel)).toBe(true);
    });

    it("should add commands to the main menu", async () => {
        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);
        expect(mainMenu.fileMenu.newMenu.items.some(item => item.command === CommandIDs.createNew)).toBe(
            true,
        );
        expect(mainMenu.kernelMenu.kernelUsers.interruptKernel.ids.includes(CommandIDs.interruptKernel)).toBe(
            true,
        );
        expect(
            mainMenu.kernelMenu.kernelUsers.reconnectToKernel.ids.includes(CommandIDs.reconnectToKernel),
        ).toBe(true);
        expect(mainMenu.kernelMenu.kernelUsers.restartKernel.ids.includes(CommandIDs.restartKernel)).toBe(
            true,
        );
        expect(mainMenu.kernelMenu.kernelUsers.shutdownKernel.ids.includes(CommandIDs.shutdownKernel)).toBe(
            true,
        );
    });

    it("should handle commands without main menu", async () => {
        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, undefined, undefined);
        expect(app.commands.hasCommand(CommandIDs.createNew)).toBe(true);
        expect(app.commands.hasCommand(CommandIDs.openWaldiez)).toBe(true);
    });

    it("should execute createNew command", async () => {
        // Mock docmanager commands
        const mockNewUntitled = jest.fn().mockResolvedValue({ path: "Untitled.waldiez" });
        const mockOpenWaldiez = jest.fn().mockResolvedValue({
            id: "widget-id",
            isAttached: false,
        });

        app.commands.addCommand("docmanager:new-untitled", { execute: mockNewUntitled });
        app.commands.addCommand(CommandIDs.openWaldiez, { execute: mockOpenWaldiez });

        const shellAddSpy = jest.spyOn(app.shell, "add");
        const shellActivateSpy = jest.spyOn(app.shell, "activateById");

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        await app.commands.execute(CommandIDs.createNew, { cwd: "/test/path" });

        expect(mockNewUntitled).toHaveBeenCalledWith({
            path: "/test/path",
            type: "file",
            ext: ".waldiez",
        });
        expect(mockOpenWaldiez).toHaveBeenCalled();
        expect(shellAddSpy).toHaveBeenCalled();
        expect(shellActivateSpy).toHaveBeenCalled();
    });

    it("should handle createNew command failure", async () => {
        const mockNewUntitled = jest.fn().mockResolvedValue(null);
        app.commands.addCommand("docmanager:new-untitled", { execute: mockNewUntitled });

        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        await app.commands.execute(CommandIDs.createNew);

        expect(consoleErrorSpy).toHaveBeenCalledWith("Could not create a new .waldiez file");

        consoleErrorSpy.mockRestore();
    });

    it("should execute openWaldiez command", async () => {
        const mockDocmanagerOpen = jest.fn().mockResolvedValue({
            id: "widget-id",
            isAttached: true,
        });

        app.commands.addCommand("docmanager:open", { execute: mockDocmanagerOpen });

        const shellActivateSpy = jest.spyOn(app.shell, "activateById");

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        await app.commands.execute(CommandIDs.openWaldiez, { path: "test.waldiez" });

        expect(mockDocmanagerOpen).toHaveBeenCalledWith({
            path: "test.waldiez",
            factory: "waldiez-factory",
        });
        expect(shellActivateSpy).toHaveBeenCalled();
    });

    it("should execute kernel commands with current widget", async () => {
        const mockWidget = {
            context: {
                sessionContext: {
                    session: {
                        kernel: {
                            interrupt: jest.fn().mockResolvedValue(true),
                            restart: jest.fn().mockResolvedValue(true),
                            reconnect: jest.fn().mockResolvedValue(true),
                        },
                    },
                    shutdown: jest.fn().mockResolvedValue(true),
                    specsManager: {
                        specs: {
                            kernelspecs: {
                                python3: { name: "python3" },
                            },
                        },
                    },
                },
            },
        } as any;

        (tracker as any).currentWidget = mockWidget;

        const shellActivateSpy = jest.spyOn(app.shell, "activateById");

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        // Test interrupt kernel
        await app.commands.execute(CommandIDs.interruptKernel);
        expect(mockWidget.context.sessionContext.session.kernel.interrupt).toHaveBeenCalled();
        expect(shellActivateSpy).toHaveBeenCalled();

        // Test restart kernel
        await app.commands.execute(CommandIDs.restartKernel);
        expect(mockWidget.context.sessionContext.session.kernel.restart).toHaveBeenCalled();

        // Test shutdown kernel
        await app.commands.execute(CommandIDs.shutdownKernel);
        expect(mockWidget.context.sessionContext.shutdown).toHaveBeenCalled();

        // Test reconnect kernel
        await app.commands.execute(CommandIDs.reconnectToKernel);
        expect(mockWidget.context.sessionContext.session.kernel.reconnect).toHaveBeenCalled();
    });

    it("should execute changeKernel command", async () => {
        (tracker as any).currentWidget = {
            context: {
                sessionContext: {
                    session: { id: "session-id" },
                    specsManager: {
                        specs: {
                            kernelspecs: {
                                python3: { name: "python3" },
                            },
                        },
                    },
                },
            },
        } as any;

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        const result = await app.commands.execute(CommandIDs.changeKernel);
        expect(result).toBeDefined();
    });

    it("should handle kernel commands without current widget", async () => {
        (tracker as any).currentWidget = null;

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        const result1 = await app.commands.execute(CommandIDs.interruptKernel);
        expect(result1).toBeUndefined();

        const result2 = await app.commands.execute(CommandIDs.restartKernel);
        expect(result2).toBeUndefined();

        const result3 = await app.commands.execute(CommandIDs.shutdownKernel);
        expect(result3).toBeUndefined();

        const result4 = await app.commands.execute(CommandIDs.reconnectToKernel);
        expect(result4).toBeUndefined();

        const result5 = await app.commands.execute(CommandIDs.changeKernel);
        expect(result5).toBeUndefined();
    });

    it("should handle kernel commands without kernel", async () => {
        const mockWidget = {
            context: {
                sessionContext: {
                    session: null,
                    shutdown: jest.fn().mockResolvedValue(true),
                },
            },
        } as any;

        (tracker as any).currentWidget = mockWidget;

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        const result1 = await app.commands.execute(CommandIDs.interruptKernel);
        expect(result1).toBeUndefined();

        const result2 = await app.commands.execute(CommandIDs.restartKernel);
        expect(result2).toBeUndefined();

        const result3 = await app.commands.execute(CommandIDs.reconnectToKernel);
        expect(result3).toBeUndefined();

        // changeKernel should return early if no session
        const result4 = await app.commands.execute(CommandIDs.changeKernel);
        expect(result4).toBeUndefined();

        // shutdown should still work
        await app.commands.execute(CommandIDs.shutdownKernel);
        expect(mockWidget.context.sessionContext.shutdown).toHaveBeenCalled();
    });

    it("should handle changeKernel without specs", async () => {
        (tracker as any).currentWidget = {
            context: {
                sessionContext: {
                    session: { id: "session-id" },
                    specsManager: {
                        specs: null,
                    },
                },
            },
        } as any;

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        const result = await app.commands.execute(CommandIDs.changeKernel);
        expect(result).toBeUndefined();
    });

    it("should handle changeKernel without kernelspecs", async () => {
        (tracker as any).currentWidget = {
            context: {
                sessionContext: {
                    session: { id: "session-id" },
                    specsManager: {
                        specs: {
                            kernelspecs: null,
                        },
                    },
                },
            },
        } as any;

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        const result = await app.commands.execute(CommandIDs.changeKernel);
        expect(result).toBeUndefined();
    });

    it("should execute export commands", async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { handleExport } = require("../rest");

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        await app.commands.execute(CommandIDs.exportToPython);
        expect(handleExport).toHaveBeenCalledWith(fileBrowserFactory, "py");

        await app.commands.execute(CommandIDs.exportToJupyter);
        expect(handleExport).toHaveBeenCalledWith(fileBrowserFactory, "ipynb");
    });

    it("should use default cwd when none provided in createNew", async () => {
        (fileBrowserFactory.tracker as any).currentWidget = null;

        const mockNewUntitled = jest.fn().mockResolvedValue({ path: "Untitled.waldiez" });
        const mockOpenWaldiez = jest.fn().mockResolvedValue({
            id: "widget-id",
            isAttached: false,
        });

        app.commands.addCommand("docmanager:new-untitled", { execute: mockNewUntitled });
        app.commands.addCommand(CommandIDs.openWaldiez, { execute: mockOpenWaldiez });

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        await app.commands.execute(CommandIDs.createNew);

        expect(mockNewUntitled).toHaveBeenCalledWith({
            path: "",
            type: "file",
            ext: ".waldiez",
        });
    });

    it("should handle openWaldiez with default path", async () => {
        const mockDocmanagerOpen = jest.fn().mockResolvedValue({
            id: "widget-id",
            isAttached: false,
        });

        app.commands.addCommand("docmanager:open", { execute: mockDocmanagerOpen });
        const shellAddSpy = jest.spyOn(app.shell, "add");

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        await app.commands.execute(CommandIDs.openWaldiez);

        expect(mockDocmanagerOpen).toHaveBeenCalledWith({
            path: "Untitled.waldiez",
            factory: "waldiez-factory",
        });
        expect(shellAddSpy).toHaveBeenCalled();
    });

    it("should not activate widget when activate is false", async () => {
        const mockWidget = {
            id: "widget-id",
            context: {
                sessionContext: {
                    session: {
                        kernel: {
                            interrupt: jest.fn().mockResolvedValue(true),
                        },
                    },
                },
            },
        } as any;

        (tracker as any).currentWidget = mockWidget;

        const shellActivateSpy = jest.spyOn(app.shell, "activateById");

        await handleWaldiezCommands(app, tracker, fileBrowserFactory, widgetFactory, mainMenu, undefined);

        await app.commands.execute(CommandIDs.interruptKernel, { activate: false });
        expect(shellActivateSpy).not.toHaveBeenCalled();
        expect(mockWidget.context.sessionContext.session.kernel.interrupt).toHaveBeenCalled();
    });
});
