import { JupyterLab } from '@jupyterlab/application';
import {
    IRenderMimeRegistry,
    RenderMimeRegistry
} from '@jupyterlab/rendermime';

import { CommandRegistry } from '@lumino/commands';
import { SplitPanel } from '@lumino/widgets';

import { WaldiezLogger } from '../logger';
import {
    executeReplyMessage,
    executeRequestMessage,
    inputRequestMessage,
    iopubMessage,
    logMessage
} from './utils';

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
describe('WaldiezLogger', () => {
    let app: jest.Mocked<JupyterLab>;
    let rendermime: IRenderMimeRegistry;

    beforeEach(() => {
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        rendermime = new RenderMimeRegistry();
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should be created', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        expect(logger).toBeTruthy();
    });
    it('should log a message', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        logger.log({ ...logMessage, level: 'info' });
    });
    it('should log an error message', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        logger.log({ ...logMessage, level: 'error' });
    });
    it('should log an iopub message', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        logger.log(iopubMessage);
    });
    it('should log an input request message', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        logger.log(inputRequestMessage);
    });
    it('should log an execute reply message', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        logger.log(executeReplyMessage);
    });
    it('should log an execute request message', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        logger.log(executeRequestMessage);
    });
    it('should clear the log', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        logger.clear();
    });
    it('should toggle the log', () => {
        const logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
        expect(logger.isVisible).toBe(false);
        logger.toggle();
        expect(logger.isVisible).toBe(true);
        logger.toggle();
        expect(logger.isVisible).toBe(false);
    });
});
