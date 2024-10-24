import { JupyterLab } from '@jupyterlab/application';
import { IEditorServices } from '@jupyterlab/codeeditor';
import {
    IRenderMimeRegistry,
    RenderMimeRegistry
} from '@jupyterlab/rendermime';
import { ISettingRegistry, SettingRegistry } from '@jupyterlab/settingregistry';

import { CommandRegistry } from '@lumino/commands';

import { FACTORY_NAME, WALDIEZ_FILE_TYPE } from '../constants';
import { WaldiezEditor } from '../editor';
import { WaldiezEditorFactory } from '../factory';
import { editorContext, mockFetch } from './utils';

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
jest.mock('../runner', () => {
    return {
        WaldiezRunner: jest.fn().mockImplementation(() => ({
            getPreviousMessages: jest.fn(),
            run: jest.fn(),
            reset: jest.fn()
        }))
    };
});

const patchServerConnection = (responseText: string, error: boolean) => {
    mockFetch(responseText, error);
    jest.mock('@jupyterlab/services', () => {
        return {
            ServerConnection: {
                makeRequest: jest.fn().mockResolvedValue({
                    text: jest.fn().mockResolvedValue(responseText)
                })
            }
        };
    });
};
jest.mock('@jupyterlab/settingregistry', () => {
    return {
        SettingRegistry: jest.fn().mockImplementation(() => ({
            get: jest.fn().mockResolvedValue({ composite: true })
        }))
    };
});

jest.mock('@jupyterlab/codeeditor');
describe('WaldiezEditor', () => {
    let app: jest.Mocked<JupyterLab>;
    let settingRegistry: ISettingRegistry;
    let rendermime: IRenderMimeRegistry;
    let editorServices: IEditorServices;
    beforeEach(() => {
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        settingRegistry = new SettingRegistry({
            connector: null as any
        }) as ISettingRegistry;
        rendermime = new RenderMimeRegistry();
        editorServices = {} as IEditorServices;
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    const getEditor: () => Promise<WaldiezEditor> = async () => {
        const factory = new WaldiezEditorFactory({
            commands: app.commands,
            rendermime,
            editorServices,
            settingRegistry,
            name: FACTORY_NAME,
            fileTypes: [WALDIEZ_FILE_TYPE]
        });
        const editor = factory.createNew(editorContext);
        await editor.revealed;
        return editor;
    };
    it('should add commands on initialization', async () => {
        const addCommandSpy = jest.spyOn(app.commands, 'addCommand');
        const editor = await getEditor();
        expect(editor).toBeTruthy();
        expect(addCommandSpy).toHaveBeenCalled();
    });

    it('should handle session status change', async () => {
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor['_logger'], 'log');
        editor['_onSessionStatusChanged'](
            editor.context.sessionContext,
            'idle'
        );
        expect(logSpy).toHaveBeenCalledWith({
            data: 'Kernel status changed to idle',
            level: 'debug',
            type: 'text'
        });
    });

    it('should restart kernel on command', async () => {
        const editor = await getEditor();
        const { context } = editor;
        const restartSpy = jest.fn();
        context.sessionContext.session = {
            kernel: {
                restart: restartSpy
            }
        } as any;
        editor['_onRestartKernel']();
        expect(restartSpy).toHaveBeenCalled();
    });

    it('should handle content change', async () => {
        const editor = await getEditor();
        const { context } = editor;
        const model = {
            ...context.model,
            fromString: jest.fn()
        };
        Object.assign(editor.context.model, model);
        const fromStringSpy = jest.spyOn(model, 'fromString');
        editor['_onContentChanged']('new content');
        expect(fromStringSpy).toHaveBeenCalledWith('new content');
    });

    it('should handle user input', async () => {
        const sendInputReplySpy = jest.fn();
        const editor = await getEditor();
        const { context } = editor;
        context.sessionContext.session = {
            kernel: {
                sendInputReply: sendInputReplySpy
            }
        } as any;
        editor['_stdinRequest'] = {
            parent_header: {}
        } as any;
        editor['_onUserInput']('user input');
        expect(sendInputReplySpy).toHaveBeenCalledWith(
            { value: 'user input', status: 'ok' },
            {}
        );
    });

    it('should handle upload catching error', async () => {
        patchServerConnection('', true);
        const editor = await getEditor();
        const uploadSpy = jest.spyOn(editor as any, 'onUpload');
        const files = [new File([''], 'file.txt')];
        const results = await editor['onUpload'](files);
        expect(uploadSpy).toHaveBeenCalledWith(files);
        expect(results).toEqual([]);
    });

    it('should handle upload', async () => {
        patchServerConnection('{"path": "path"}', false);
        const editor = await getEditor();
        const files = [new File([''], 'file.txt')];
        const path = await editor['onUpload'](files);
        expect(path).toEqual(['path']);
    });

    it('should handle run', async () => {
        patchServerConnection('{"path": "path"}', false);
        const editor = await getEditor();
        Object.assign(editor.context, {
            save: jest.fn()
        });
        const runSpy = jest.spyOn(editor['_runner'], 'run');
        editor['_onRun']('content');
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        expect(runSpy).toHaveBeenCalled();
    });

    it('should handle run catching error', async () => {
        patchServerConnection('', true);
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor['_logger'], 'log');
        editor['_onRun']('content');
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        expect(logSpy).toHaveBeenCalled();
    });
    it('should handle stdin', async () => {
        const editor = await getEditor();
        const logSpy = jest.spyOn(editor['_logger'], 'log');
        editor['_onStdin']({ content: { prompt: 'prompt' } } as any);
        expect(logSpy).toHaveBeenCalledWith({
            data: 'prompt',
            level: 'warning',
            type: 'text'
        });
    });
    it('should handle serve monaco setting', async () => {
        const editor = await getEditor();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        // const getSpy = jest.spyOn(editor as any, '_getServeMonacoSetting');
        // getSpy.mockResolvedValue(true);
        const result = await editor['_getServeMonacoSetting']();
        expect(result).toBeTruthy();
    });
    it('should dispose', async () => {
        const editor = await getEditor();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        const disposeSpy = jest.spyOn(editor, 'dispose');
        editor.dispose();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await new Promise(process.nextTick);
        expect(disposeSpy).toHaveBeenCalled();
    });
});
