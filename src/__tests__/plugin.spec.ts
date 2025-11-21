/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { PLUGIN_ID, WALDIEZ_FILE_TYPE } from "../constants";
import plugin from "../index";
import { mockFetch, patchServerConnection } from "./utils";
import { JupyterLab } from "@jupyterlab/application";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { IMainMenu, MainMenu } from "@jupyterlab/mainmenu";
import { RenderMimeRegistry } from "@jupyterlab/rendermime";
import { ISettingRegistry, SettingRegistry } from "@jupyterlab/settingregistry";

jest.mock("../commands", () => ({
    ...jest.requireActual("../commands"),
    handleWaldiezCommands: jest.fn().mockResolvedValue(true),
}));

describe("Waldiez Plugin", () => {
    let app: jest.Mocked<JupyterLab>;
    let rendermime: RenderMimeRegistry;
    let settingRegistry: jest.Mocked<ISettingRegistry>;
    let editorServices: jest.Mocked<IEditorServices>;
    let mainMenu: IMainMenu;

    beforeEach(() => {
        mockFetch('{"composite": true}', false);
        patchServerConnection('{"composite": true}', false);
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        (app as any).shell = {
            add: jest.fn(),
            activateById: jest.fn(),
        } as any;

        // Mock docRegistry
        (app as any).docRegistry = {
            addFileType: jest.fn(),
            addWidgetFactory: jest.fn(),
        } as any;
        rendermime = new RenderMimeRegistry();
        settingRegistry = new SettingRegistry({
            connector: null as any,
        }) as any;
        editorServices = {} as jest.Mocked<IEditorServices>;
        mainMenu = new MainMenu(app.commands);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it("should have the correct id", () => {
        expect(plugin.id).toBe(PLUGIN_ID);
    });

    it("should auto start", () => {
        expect(plugin.autoStart).toBe(true);
    });

    it("should activate correctly", async () => {
        const mockFileBrowserFactory = {};
        const mockRestorer = {
            restore: jest.fn(),
        };
        const mockLauncher = {
            add: jest.fn().mockImplementation(() => {}),
        };
        const mockPalette = {
            addItem: jest.fn(),
        };
        const mockTranslator = {};
        const result = await plugin.activate(
            app,
            rendermime,
            editorServices,
            mockFileBrowserFactory,
            settingRegistry,
            mockRestorer,
            mockLauncher,
            mockPalette,
            mainMenu,
            mockTranslator,
        );
        expect(result).toBeDefined();
    });

    it("should activate correctly without optional services", async () => {
        const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

        const mockFileBrowserFactory = {};

        const result = await plugin.activate(
            app,
            rendermime,
            editorServices,
            mockFileBrowserFactory,
            settingRegistry,
        );

        expect(result).toBeDefined();
        expect(consoleLogSpy).toHaveBeenCalledWith("JupyterLab extension waldiez is activated!");
        expect(app.docRegistry.addFileType).toHaveBeenCalled();
        expect(app.docRegistry.addWidgetFactory).toHaveBeenCalled();

        consoleLogSpy.mockRestore();
    });
    it("should register file type correctly", async () => {
        const mockFileBrowserFactory = {};

        await plugin.activate(app, rendermime, editorServices, mockFileBrowserFactory, settingRegistry);

        expect(app.docRegistry.addFileType).toHaveBeenCalledWith({
            name: WALDIEZ_FILE_TYPE,
            displayName: "Waldiez File",
            contentType: "file",
            fileFormat: "json",
            extensions: [`.${WALDIEZ_FILE_TYPE}`],
            mimeTypes: ["application/json", "text/json"],
            icon: expect.any(Object), // waldiezIcon
            iconLabel: "JupyterLab-Waldiez",
        });
    });

    it("should create widget factory with correct options", async () => {
        const mockFileBrowserFactory = {};
        const mockTranslator = {};

        await plugin.activate(
            app,
            rendermime,
            editorServices,
            mockFileBrowserFactory,
            settingRegistry,
            undefined, // restorer
            undefined, // launcher
            undefined, // palette
            mainMenu,
            mockTranslator,
        );

        // Verify addWidgetFactory was called
        expect(app.docRegistry.addWidgetFactory).toHaveBeenCalled();

        // Get the widget factory
        const addWidgetFactoryCall = (app.docRegistry.addWidgetFactory as jest.Mock).mock.calls[0];
        const widgetFactory = addWidgetFactoryCall[0];

        // Verify the factory has correct properties
        expect(widgetFactory.name).toBe("Waldiez editor");
        expect(widgetFactory.fileTypes).toEqual([WALDIEZ_FILE_TYPE]);
        expect(widgetFactory.defaultFor).toEqual([WALDIEZ_FILE_TYPE]);
    });
    it("should activate correctly with all optional services", async () => {
        const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

        const mockFileBrowserFactory = {};
        const mockRestorer = {
            restore: jest.fn(),
        };
        const mockLauncher = {
            add: jest.fn(),
        };
        const mockPalette = {
            addItem: jest.fn(),
        };
        const mockTranslator = {};

        const result = await plugin.activate(
            app,
            rendermime,
            editorServices,
            mockFileBrowserFactory,
            settingRegistry,
            mockRestorer,
            mockLauncher,
            mockPalette,
            mainMenu,
            mockTranslator,
        );

        expect(result).toBeDefined();
        expect(consoleLogSpy).toHaveBeenCalledWith("JupyterLab extension waldiez is activated!");
        expect(mockLauncher.add).toHaveBeenCalled();
        expect(mockPalette.addItem).toHaveBeenCalled();
        expect(mockRestorer.restore).toHaveBeenCalled();
        expect(app.docRegistry.addFileType).toHaveBeenCalled();
        expect(app.docRegistry.addWidgetFactory).toHaveBeenCalled();
        consoleLogSpy.mockRestore();
    });
});
