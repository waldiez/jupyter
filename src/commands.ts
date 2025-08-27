/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WALDIEZ_FILE_TYPE, WALDIEZ_STRINGS } from "./constants";
import { WaldiezEditor } from "./editor";
import { WaldiezEditorFactory } from "./factory";
import { waldiezIcon } from "./icon";
import { handleExport } from "./rest";
import { JupyterFrontEnd } from "@jupyterlab/application";
import { SessionContextDialogs, WidgetTracker } from "@jupyterlab/apputils";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import { IMainMenu } from "@jupyterlab/mainmenu";
import { ITranslator } from "@jupyterlab/translation";
import { notebookIcon, pythonIcon } from "@jupyterlab/ui-components";

export namespace CommandIDs {
    export const createNew = "waldiez:create-new";
    export const openWaldiez = "waldiez:open-waldiez";
    export const clearLogs = "waldiez:clear-logs";
    export const copyLogs = "waldiez:copy-logs";
    export const toggleLogsView = "waldiez:toggle-logs-view";
    export const interruptKernel = "waldiez:interrupt-kernel";
    export const reconnectToKernel = "waldiez:reconnect-to-kernel";
    export const shutdownKernel = "waldiez:shutdown-kernel";
    export const restartKernel = "waldiez:restart-kernel";
    export const changeKernel = "waldiez:change-kernel";
    export const exportToPython = "waldiez:to-py";
    export const exportToJupyter = "waldiez:to-ipynb";
}

/**
 * Check if the current widget is a WaldiezEditor
 * @param app The JupyterFrontEnd app
 * @param tracker The WidgetTracker
 * @returns boolean indicating if the current widget is a WaldiezEditor or not
 */
const isWaldiezEditor: (app: JupyterFrontEnd, tracker: WidgetTracker<WaldiezEditor>) => boolean = (
    app,
    tracker,
) => {
    /* istanbul ignore next */
    return tracker.currentWidget !== null && tracker.currentWidget === app.shell.currentWidget;
};

/**
 * Handle Waldiez commands
 * @param app The JupyterFrontEnd app
 * @param tracker The WaldiezEditor WidgetTracker
 * @param fileBrowserFactory The file browser factory
 * @param widgetFactory The WaldiezEditor factory
 * @param mainMenu The main menu
 * @param translator The translator
 */
export const handleWaldiezCommands = async (
    app: JupyterFrontEnd,
    tracker: WidgetTracker<WaldiezEditor>,
    fileBrowserFactory: IFileBrowserFactory,
    widgetFactory: WaldiezEditorFactory,
    mainMenu?: IMainMenu,
    translator?: ITranslator,
) => {
    const isEnabled = isWaldiezEditor.bind(null, app, tracker);
    registerCommands(app, tracker, fileBrowserFactory, widgetFactory, isEnabled, translator);
    if (mainMenu) {
        addCommandsToMenu(mainMenu, isEnabled);
    }
};

/**
 * Add commands to the main menu
 * @param mainMenu The main menu
 * @param isEnabled A function to check if the command should be enabled
 */
const addCommandsToMenu = (mainMenu: IMainMenu, isEnabled: () => boolean) => {
    // File -> New -> Waldiez File
    const newMenu = mainMenu.fileMenu.newMenu;
    newMenu.addItem({ command: CommandIDs.createNew });
    // Kernel
    mainMenu.kernelMenu.kernelUsers.interruptKernel.add({
        id: CommandIDs.interruptKernel,
        isEnabled,
    });
    mainMenu.kernelMenu.kernelUsers.reconnectToKernel.add({
        id: CommandIDs.reconnectToKernel,
        isEnabled,
    });
    mainMenu.kernelMenu.kernelUsers.restartKernel.add({
        id: CommandIDs.restartKernel,
        isEnabled,
    });
    mainMenu.kernelMenu.kernelUsers.shutdownKernel.add({
        id: CommandIDs.shutdownKernel,
        isEnabled,
    });
    mainMenu.kernelMenu.kernelUsers.changeKernel.add({
        id: CommandIDs.changeKernel,
        isEnabled,
    });
};

/**
 * Get the current widget and activate unless the args specify otherwise.
 * @returns The current widget
 * @throws An error if the current widget is not a WaldiezEditor
 * @param app
 * @param tracker
 * @param fileBrowserFactory
 * @param widgetFactory
 * @param isEnabled
 * @param translator
 **/
export const registerCommands = (
    app: JupyterFrontEnd,
    tracker: WidgetTracker<WaldiezEditor>,
    fileBrowserFactory: IFileBrowserFactory,
    widgetFactory: WaldiezEditorFactory,
    isEnabled: () => boolean,
    translator?: ITranslator,
) => {
    const { commands } = app;
    const getCurrentWidget: (args: any) => WaldiezEditor | null = args => {
        const widget = tracker.currentWidget;
        const activate = args["activate"] !== false;
        if (activate && widget) {
            app.shell.activateById(widget.id);
        }
        return widget ?? null;
    };
    // create a new .waldiez file
    if (!commands.hasCommand(CommandIDs.createNew)) {
        commands.addCommand(CommandIDs.createNew, {
            label: args =>
                args["isPalette"] ? WALDIEZ_STRINGS.NEW_WALDIEZ_FILE : WALDIEZ_STRINGS.WALDIEZ_FILE,
            caption: WALDIEZ_STRINGS.CAPTION,
            icon: waldiezIcon,
            execute: async args => {
                const cwd = args["cwd"] || fileBrowserFactory.tracker.currentWidget?.model.path || "";
                const file = await commands.execute("docmanager:new-untitled", {
                    path: cwd,
                    type: "file",
                    ext: `.${WALDIEZ_FILE_TYPE}`,
                });
                if (!file) {
                    console.error("Could not create a new .waldiez file");
                    return;
                }
                const widget = await commands.execute(CommandIDs.openWaldiez, {
                    cwd,
                    path: file.path,
                    factory: widgetFactory.name,
                });
                if (widget) {
                    if (!widget.isAttached) {
                        app.shell.add(widget, "main");
                    }
                    app.shell.activateById(widget.id);
                }
            },
        });
    }
    // open a .waldiez file
    if (!commands.hasCommand(CommandIDs.openWaldiez)) {
        commands.addCommand(CommandIDs.openWaldiez, {
            label: WALDIEZ_STRINGS.OPEN_WALDIEZ,
            icon: waldiezIcon,
            execute: async args => {
                const path = args["path"];
                const widget = await app.commands.execute("docmanager:open", {
                    path: path ?? `Untitled.${WALDIEZ_FILE_TYPE}`,
                    factory: widgetFactory.name,
                });
                if (widget) {
                    if (!widget.isAttached) {
                        app.shell.add(widget, "main");
                    }
                    app.shell.activateById(widget.id);
                }
            },
        });
    }
    // convert a .waldiez to .py
    if (!commands.hasCommand(CommandIDs.exportToPython)) {
        commands.addCommand(CommandIDs.exportToPython, {
            label: WALDIEZ_STRINGS.TO_PYTHON,
            caption: WALDIEZ_STRINGS.TO_PYTHON_CAPTION,
            icon: pythonIcon,
            execute: async () => handleExport(fileBrowserFactory, "py"),
        });
    }
    // convert a .waldiez to .ipynb
    if (!commands.hasCommand(CommandIDs.exportToJupyter)) {
        commands.addCommand(CommandIDs.exportToJupyter, {
            label: WALDIEZ_STRINGS.TO_JUPYTER,
            caption: WALDIEZ_STRINGS.TO_JUPYTER_CAPTION,
            icon: notebookIcon,
            execute: async () => handleExport(fileBrowserFactory, "ipynb"),
        });
    }
    // interrupt kernel
    if (!commands.hasCommand(CommandIDs.interruptKernel)) {
        commands.addCommand(CommandIDs.interruptKernel, {
            label: WALDIEZ_STRINGS.INTERRUPT_KERNEL,
            execute: args => {
                const current = getCurrentWidget(args);
                if (!current) {
                    return;
                }
                const kernel = current.context.sessionContext.session?.kernel;
                if (kernel) {
                    return kernel.interrupt();
                }
                return Promise.resolve(void 0);
            },
            isEnabled,
        });
    }
    // restart kernel
    if (!commands.hasCommand(CommandIDs.restartKernel)) {
        commands.addCommand(CommandIDs.restartKernel, {
            label: WALDIEZ_STRINGS.RESTART_KERNEL,
            execute: args => {
                const current = getCurrentWidget(args);
                if (!current) {
                    return;
                }
                const kernel = current.context.sessionContext.session?.kernel;
                if (kernel) {
                    return kernel.restart();
                }
                return Promise.resolve(void 0);
            },
            isEnabled,
        });
    }
    // change kernel
    if (!commands.hasCommand(CommandIDs.changeKernel)) {
        commands.addCommand(CommandIDs.changeKernel, {
            label: WALDIEZ_STRINGS.CHANGE_KERNEL,
            execute: args => {
                const current = getCurrentWidget(args);
                if (!current) {
                    return;
                }
                const sessionContext = current.context.sessionContext;
                const session = sessionContext.session;
                if (!session) {
                    return;
                }
                const kernelOptions = sessionContext.specsManager.specs?.kernelspecs;
                if (!kernelOptions) {
                    return;
                }
                const contextDialogs = new SessionContextDialogs({
                    translator,
                });
                return contextDialogs.selectKernel(sessionContext);
            },
            isEnabled,
        });
    }
    // shutdown kernel
    if (!commands.hasCommand(CommandIDs.shutdownKernel)) {
        commands.addCommand(CommandIDs.shutdownKernel, {
            label: WALDIEZ_STRINGS.SHUTDOWN_KERNEL,
            execute: args => {
                const current = getCurrentWidget(args);
                if (!current) {
                    return;
                }
                return current.context.sessionContext.shutdown();
            },
            isEnabled,
        });
    }
    // reconnect to kernel
    if (!commands.hasCommand(CommandIDs.reconnectToKernel)) {
        commands.addCommand(CommandIDs.reconnectToKernel, {
            label: WALDIEZ_STRINGS.RECONNECT_TO_KERNEL,
            execute: args => {
                const current = getCurrentWidget(args);
                if (!current) {
                    return;
                }
                const kernel = current.context.sessionContext.session?.kernel;
                if (kernel) {
                    return kernel.reconnect();
                }
                return Promise.resolve(void 0);
            },
            isEnabled,
        });
    }
};
