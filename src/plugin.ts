import {
    ILayoutRestorer,
    JupyterFrontEnd,
    JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';

import { CommandIDs, handleWaldiezCommands } from './commands';
import {
    FACTORY_NAME,
    NAMESPACE,
    PLUGIN_ID,
    WALDIEZ_FILE_TYPE,
    WALDIEZ_STRINGS
} from './constants';
import { WaldiezEditor } from './editor';
import { WaldiezEditorFactory } from './factory';
import { waldiezIcon } from './icon';

/**
 * Initialization data for the waldiez extension.
 * @param app The JupyterLab application
 * @param rendermime The rendermime registry
 * @param editorServices The editor services
 * @param fileBrowserFactory The file browser factory
 * @param settingregistry The setting registry
 * @param restorer The layout restorer (optional)
 * @param launcher The launcher (optional)
 * @param palette The command palette (optional)
 * @param mainMenu The main menu (optional)
 * @param translator The translator (optional)
 */
const plugin: JupyterFrontEndPlugin<
    WaldiezEditorFactory,
    JupyterFrontEnd.IShell,
    'desktop' | 'mobile'
> = {
    id: PLUGIN_ID,
    description: WALDIEZ_STRINGS.PLUGIN_DESCRIPTION,
    autoStart: true,
    requires: [
        IRenderMimeRegistry,
        IEditorServices,
        IFileBrowserFactory,
        ISettingRegistry
    ],
    optional: [
        ILayoutRestorer,
        ILauncher,
        ICommandPalette,
        IMainMenu,
        ITranslator
    ],
    activate: async (
        app: JupyterFrontEnd,
        rendermime: IRenderMimeRegistry,
        editorServices: IEditorServices,
        fileBrowserFactory: IFileBrowserFactory,
        settingRegistry: ISettingRegistry,
        restorer?: ILayoutRestorer,
        launcher?: ILauncher,
        palette?: ICommandPalette,
        mainMenu?: IMainMenu,
        translator?: ITranslator
    ) => {
        console.log('JupyterLab extension waldiez is activated!');
        const namespace = NAMESPACE;
        const tracker = new WidgetTracker<WaldiezEditor>({ namespace });
        const widgetFactory = new WaldiezEditorFactory({
            name: 'Waldie',
            fileTypes: [WALDIEZ_FILE_TYPE],
            defaultFor: [WALDIEZ_FILE_TYPE],
            canStartKernel: true,
            preferKernel: true,
            shutdownOnClose: false,
            autoStartDefault: true,
            commands: app.commands,
            translator,
            rendermime,
            editorServices,
            settingRegistry
        });
        if (launcher) {
            launcher.add({
                command: CommandIDs.createNew,
                category: 'Other',
                rank: 1
            });
        }
        if (palette) {
            palette.addItem({
                command: CommandIDs.createNew,
                args: { isPalette: true },
                category: FACTORY_NAME
            });
        }
        // Handle state restoration.
        if (restorer) {
            // console.log('Restoring state...');
            restorer.restore(tracker, {
                command: CommandIDs.openWaldiez,
                args: widget => ({
                    path: widget.context.path,
                    factory: FACTORY_NAME
                }),
                name: widget => widget.context.path
            });
        }
        widgetFactory.widgetCreated.connect((_sender, widget) => {
            widget.title.icon = waldiezIcon;
            widget.context.pathChanged.connect(() => {
                tracker.save(widget);
            });
            if (!tracker.has(widget)) {
                tracker.add(widget);
            }
            if (!widget.isAttached) {
                app.shell.add(widget, 'main');
            }
            app.shell.activateById(widget.id);
        });
        // Register the file type
        app.docRegistry.addFileType({
            name: WALDIEZ_FILE_TYPE,
            displayName: WALDIEZ_STRINGS.WALDIEZ_FILE,
            contentType: 'file',
            fileFormat: 'json',
            extensions: [`.${WALDIEZ_FILE_TYPE}`],
            mimeTypes: ['application/json', 'text/json'],
            icon: waldiezIcon,
            iconLabel: 'JupyterLab-Waldie'
        });
        app.docRegistry.addWidgetFactory(widgetFactory);
        await handleWaldiezCommands(
            app,
            tracker,
            fileBrowserFactory,
            widgetFactory,
            mainMenu,
            translator
        );
        return widgetFactory;
    }
};

export default plugin;
