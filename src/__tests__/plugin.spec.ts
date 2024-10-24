// generate tests for ../plugin.ts:
import { JupyterLab } from '@jupyterlab/application';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { IMainMenu, MainMenu } from '@jupyterlab/mainmenu';
import { RenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry, SettingRegistry } from '@jupyterlab/settingregistry';

import { PLUGIN_ID } from '../constants';
import plugin from '../index';
import { mockFetch, patchServerConnection } from './utils';

describe('Waldiez Plugin', () => {
    let app: jest.Mocked<JupyterLab>;
    let rendermime: RenderMimeRegistry;
    let settingRegistry: jest.Mocked<ISettingRegistry>;
    let editorServices: jest.Mocked<IEditorServices>;
    let mainMenu: IMainMenu;

    beforeEach(() => {
        mockFetch('{"composite": true}', false);
        patchServerConnection('{"composite": true}', false);
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        rendermime = new RenderMimeRegistry();
        settingRegistry = new SettingRegistry({
            connector: null as any
        }) as any;
        editorServices = {} as jest.Mocked<IEditorServices>;
        mainMenu = new MainMenu(app.commands);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should have the correct id', () => {
        expect(plugin.id).toBe(PLUGIN_ID);
    });

    it('should auto start', () => {
        expect(plugin.autoStart).toBe(true);
    });

    it('should activate correctly', async () => {
        const mockFileBrowserFactory = {};
        const mockRestorer = {
            restore: jest.fn()
        };
        const mockLauncher = {
            add: jest.fn().mockImplementation(() => {})
        };
        const mockPalette = {
            addItem: jest.fn()
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
            mockTranslator
        );
        expect(result).toBeDefined();
    });
});
