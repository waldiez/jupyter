import { JupyterLab } from '@jupyterlab/application';
import {
    IRenderMimeRegistry,
    RenderMimeRegistry
} from '@jupyterlab/rendermime';
import { Kernel } from '@jupyterlab/services';

import { CommandRegistry } from '@lumino/commands';
import { SplitPanel } from '@lumino/widgets';

import { WALDIEZ_STRINGS } from '../constants';
import { WaldiezLogger } from '../logger';
import { WaldiezRunner } from '../runner';
import {
    errorMsg,
    executeReplyMessage,
    inputRequestMessage,
    iopubMessage
} from './utils';

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
jest.mock('../logger', () => {
    const WaldiezLogger = jest.requireActual('../logger').WaldiezLogger;
    return {
        WaldiezLogger,
        getCodeToExecute: jest.fn()
    };
});
const onStdin = jest.fn();
const mockKernelConnectionSuccess = {
    requestExecute: jest.fn().mockReturnValue({
        onIOPub: jest.fn(),
        onReply: jest.fn(),
        onStdin: jest.fn(),
        done: Promise.resolve()
    }),
    status: 'idle'
} as unknown as Kernel.IKernelConnection;

const mockKernelConnectionNoRequestExecute = {
    requestExecute: () => undefined,
    status: 'idle'
} as unknown as Kernel.IKernelConnection;

const mockKernelConnectionFail = {
    requestExecute: jest.fn().mockReturnValue({
        onIOPub: jest.fn(),
        onReply: jest.fn(),
        onStdin: jest.fn(),
        done: Promise.reject()
    }),
    status: 'idle'
} as unknown as Kernel.IKernelConnection;

describe('WaldiezRunner', () => {
    let app: jest.Mocked<JupyterLab>;
    let rendermime: IRenderMimeRegistry;
    let logger: WaldiezLogger;

    beforeEach(() => {
        app = new JupyterLab() as jest.Mocked<JupyterLab>;
        rendermime = new RenderMimeRegistry();
        logger = new WaldiezLogger({
            commands: app.commands,
            rendermime,
            editorId: 'editorId',
            panel: new SplitPanel()
        });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should be created', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        expect(runner).toBeTruthy();
    });
    it('should run a waldiez file', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        expect(runner.running).toBe(true);
    });
    it('should not run a waldiez file if one is already running', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        expect(runner.running).toBe(true);
        const consoleWarnSpy = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => {});
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'A waldiez file is already running'
        );
        consoleWarnSpy.mockRestore();
    });
    it('should log an error if the kernel request fails', async () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(mockKernelConnectionFail, 'path/to/file.waldiez');
        expect(runner.running).toBe(true);
        const consoleErrorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        try {
            await mockKernelConnectionFail.requestExecute({
                code: 'any',
                silent: true,
                stop_on_error: true
            }).done;
        } catch (_) {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error while running the waldiez file',
                undefined
            );
        }
    });
    it('should not run a waldiez file if the kernel does not support requestExecute', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(
            mockKernelConnectionNoRequestExecute,
            'path/to/file.waldiez'
        );
        expect(runner.running).toBe(false);
    });
    it('should reset the runner', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        expect(runner.running).toBe(true);
        runner.reset();
        expect(runner.running).toBe(false);
    });
    it('should handle stdin messages', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        expect(runner['_future']).toBeDefined();
        runner['_future']!.onStdin(inputRequestMessage);
        expect(runner['_messages']).not.toContain('>');
        expect(onStdin).toHaveBeenCalledWith(inputRequestMessage);
    });

    it('should handle IOPub stream messages', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        const streamMsg = {
            ...iopubMessage,
            content: { name: 'stdout' as const, text: 'Hello, World' }
        };
        runner['_future']!.onIOPub(streamMsg);
        expect(runner['_messages']).toContain('Hello, World');
    });
    it('should handle IOPub error messages', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        const loggerLogSpy = jest.spyOn(logger, 'log');
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        runner['_future']!.onIOPub(errorMsg);
        expect(loggerLogSpy).toHaveBeenCalledWith(errorMsg);
        loggerLogSpy.mockRestore();
    });
    it('should handle reply messages correctly', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        const loggerLogSpy = jest.spyOn(logger, 'log');
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        runner['_future']!.onReply(executeReplyMessage);
        expect(runner['_messages']).toContain('ok');
        expect(loggerLogSpy).toHaveBeenCalledWith(executeReplyMessage);
    });
    it('should filter and return previous messages correctly', () => {
        const runner = new WaldiezRunner({
            logger,
            onStdin
        });
        runner.run(mockKernelConnectionSuccess, 'path/to/file.waldiez');
        runner['_messages'] = [
            'Installing requirements...',
            WALDIEZ_STRINGS.STARTING_WORKFLOW,
            'Step 1 completed',
            'Step 2 completed',
            'Input required'
        ];
        const inputPrompt = 'Input required';
        const previousMessages = runner.getPreviousMessages(inputPrompt);
        expect(previousMessages).toEqual([
            'Step 1 completed',
            'Step 2 completed'
        ]);
    });
});
