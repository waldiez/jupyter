import { JupyterLab } from '@jupyterlab/application';
import { IEditorServices } from '@jupyterlab/codeeditor';
import {
    IRenderMimeRegistry,
    RenderMimeRegistry
} from '@jupyterlab/rendermime';
import { ISettingRegistry, SettingRegistry } from '@jupyterlab/settingregistry';

import { CommandRegistry } from '@lumino/commands';

import { FACTORY_NAME, WALDIEZ_FILE_TYPE } from '../constants';
import { WaldiezEditorFactory } from '../factory';
import { editorContext, mockEditor } from './utils';

jest.mock('@jupyterlab/settingregistry');
jest.mock('@jupyterlab/codeeditor');
jest.mock('@jupyterlab/application', () => {
    return {
        JupyterLab: jest.fn().mockImplementation(() => {
            const actual = jest.requireActual('@jupyterlab/application');
            return {
                ...actual,
                commands: new CommandRegistry()
            };
        })
    };
});
jest.mock('../editor', () => {
    return {
        WaldiezEditor: jest.fn().mockImplementation(() => mockEditor)
    };
});

describe('WaldiezEditorFactory', () => {
    let app: jest.Mocked<JupyterLab>;
    let settingRegistry: jest.Mocked<ISettingRegistry>;
    let editorServices: jest.Mocked<IEditorServices>;
    let rendermime: IRenderMimeRegistry;

    beforeEach(() => {
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        settingRegistry = new SettingRegistry({
            connector: null as any
        }) as any;
        editorServices = {} as jest.Mocked<IEditorServices>;
        rendermime = new RenderMimeRegistry();
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should be created', () => {
        const factory = new WaldiezEditorFactory({
            commands: app.commands,
            rendermime,
            editorServices,
            settingRegistry,
            name: FACTORY_NAME,
            fileTypes: [WALDIEZ_FILE_TYPE]
        });
        expect(factory).toBeTruthy();
        expect(factory.name).toBe(FACTORY_NAME);
    });
    it('should create a new instance of WaldiezEditor', () => {
        const factory = new WaldiezEditorFactory({
            commands: app.commands,
            rendermime,
            editorServices,
            settingRegistry,
            name: FACTORY_NAME,
            fileTypes: [WALDIEZ_FILE_TYPE]
        });
        const widget = factory.createNew(editorContext);
        expect(widget).toBeTruthy();
    });
});
