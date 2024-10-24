import { Kernel } from '@jupyterlab/services';
import {
    IErrorMsg,
    IExecuteReplyMsg,
    IExecuteRequestMsg,
    IInputRequestMsg,
    IStreamMsg
} from '@jupyterlab/services/lib/kernel/messages';

import { WALDIEZ_STRINGS } from './constants';
import { WaldiezLogger } from './logger';

export const getCodeToExecute = (filePath: string) => {
    return (
        'from pathlib import Path\n' +
        'from waldiez import WaldiezRunner\n\n' +
        `file_path = Path(r"${filePath}").as_posix()\n` +
        'runner = WaldiezRunner.load(waldiez_file=file_path)\n' +
        'runner.run()'
    );
};

/**
 * The runner class to run a waldiez file through a kernel.
 * It listens for stdin and iopub messages.
 * It also logs the messages.
 * @param logger The logger to use for logging
 * @param onStdin The function to call when an stdin request is received
 */
export class WaldiezRunner {
    private _running: boolean = false;
    private _future?: Kernel.IShellFuture<IExecuteRequestMsg, IExecuteReplyMsg>;
    private _onStdin: (msg: IInputRequestMsg) => void;
    private _messages: string[] = [];
    private _logger: WaldiezLogger;

    constructor({ logger, onStdin }: WaldiezRunner.IOptions) {
        this._logger = logger;
        this._onStdin = onStdin;
    }

    /**
     * Get whether a waldiez file is running.
     * @returns Whether a waldiez file is running
     * @public
     * @readonly
     * @type {boolean}
     * @memberof WaldiezRunner
     */
    get running() {
        return this._running;
    }

    /**
     * Run a waldiez file.
     * When the code is sent for execution, we listen for stdin and iopub messages.
     * @param kernel The kernel to run the code
     * @param filePath The path of the waldiez file
     * @public
     * @memberof WaldiezRunner
     */
    run(kernel: Kernel.IKernelConnection, filePath: string) {
        if (this._running) {
            console.warn('A waldiez file is already running');
            return;
        }
        this._running = true;
        this._messages = [];
        const code = getCodeToExecute(filePath);
        this._future = kernel.requestExecute(
            {
                code,
                stop_on_error: true
            },
            false
        );
        this._onFuture();
    }

    /**
     * Reset the runner's state.
     * @public
     * @memberof WaldiezRunner
     */
    reset() {
        this._running = false;
        this._future = undefined;
        this._messages = [];
    }

    /**
     * Get previous messages to pass with the input prompt.
     * @param inputPrompt The input prompt
     * @returns The previous messages
     * @public
     * @memberof WaldiezRunner
     */
    getPreviousMessages(inputPrompt: string) {
        // filter previous messages (like installing requirements)
        // and start from the `starting workflow` message
        const starting = WALDIEZ_STRINGS.STARTING_WORKFLOW;
        const start = this._messages.findIndex(
            // msg => msg === starting || msg === `${starting}\n`
            msg => msg.startsWith(starting) || msg.startsWith(`${starting}\n`)
        );
        if (start >= 0) {
            this._messages = this._messages.slice(start + 1);
        }
        const last = this._messages.length - 1;
        if (this._messages[last] === inputPrompt) {
            this._messages = this._messages.slice(0, last);
        }
        const messagesToSend = [];
        for (const msg of this._messages) {
            if (msg !== inputPrompt && msg !== inputPrompt + '\n') {
                const lines = msg.split('\n');
                for (const line of lines) {
                    messagesToSend.push(this._remove_ansi(line));
                }
            }
        }
        return messagesToSend;
    }
    /**
     * Remove ANSI escape sequences from a string.
     * @param str The string to remove ANSI escape sequences from
     * @returns The string without ANSI escape sequences
     * @private
     * @memberof WaldiezRunner
     */
    private _remove_ansi(str: string): string {
        // eslint-disable-next-line no-control-regex
        return str.replace(/\u001b\[[0-9;]*m/g, '');
    }
    /**
     * Listen for stdin, iopub and reply messages.
     * @private
     * @memberof WaldiezRunner
     */
    private _onFuture() {
        if (!this._future) {
            console.error('Failed to create a future for the waldiez file');
            this.reset();
            return;
        }
        this._future.onStdin = msg => {
            const requestMsg = msg as IInputRequestMsg;
            const prompt = requestMsg.content.prompt;
            if (!['>', '> '].includes(prompt)) {
                this._messages.push(requestMsg.content.prompt);
            }
            this._onStdin(requestMsg);
        };
        this._future.onIOPub = msg => {
            const msgType = msg.header.msg_type;
            if (msgType === 'stream') {
                const streamMsg = msg as IStreamMsg;
                if (streamMsg.content.name === 'stdout') {
                    this._messages.push(streamMsg.content.text);
                }
                this._logger.log(streamMsg);
            } else if (msgType === 'error') {
                this._logger.log(msg as IErrorMsg);
            }
        };
        this._future.onReply = msg => {
            this._messages.push(msg.content.status);
            this._logger.log(msg);
        };
        this._future.done
            .catch(err => {
                console.error('Error while running the waldiez file', err);
                if (!err) {
                    err = {
                        channel: 'iopub',
                        content: {
                            name: 'stderr',
                            text: 'Failed to run the waldiez file'
                        },
                        header: { msg_type: 'stream' },
                        metadata: {}
                    };
                }
                this._logger.log(err as IStreamMsg);
            })
            .finally(() => {
                this.reset();
            });
    }
}

/**
 * The namespace for the WaldiezRunner class.
 * It contains the IOptions interface.
 */
export namespace WaldiezRunner {
    export interface IOptions {
        logger: WaldiezLogger;
        onStdin: (msg: IInputRequestMsg) => void;
    }
}
