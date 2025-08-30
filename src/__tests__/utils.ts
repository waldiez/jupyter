/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import type { ILogPayload } from "@jupyterlab/logconsole";
import type {
    IErrorMsg,
    IExecuteReplyMsg,
    IExecuteRequestMsg,
    IInputRequestMsg,
    IStreamMsg,
} from "@jupyterlab/services/lib/kernel/messages";

export const logMessage: ILogPayload = {
    type: "text",
    data: "Hello, World!",
    level: "error",
};

export const iopubMessage: IStreamMsg = {
    channel: "iopub",
    content: {
        name: "stderr",
        text: "warning: Hello, World!",
    },
    header: {
        msg_type: "stream",
        msg_id: "123",
        session: "123",
        username: "test",
        version: "1.0",
        date: "2021-01-01",
    },
    metadata: {},
    parent_header: {},
};

export const errorMsg: IErrorMsg = {
    channel: "iopub",
    content: {
        ename: "NameError",
        evalue: 'NameError: name "x" is not defined',
        traceback: ['NameError: name "x" is not defined'],
    },
    header: {
        msg_type: "error",
        msg_id: "123",
        session: "123",
        username: "test",
        version: "1.0",
        date: "2021-01-01",
    },
    metadata: {},
    parent_header: {},
};

export const inputRequestMessage: IInputRequestMsg = {
    channel: "stdin",
    content: {
        prompt: ">>>",
        password: false,
    },
    header: {
        msg_type: "input_request",
        msg_id: "123",
        session: "123",
        username: "test",
        version: "1.0",
        date: "2021-01-01",
    },
    metadata: {},
    parent_header: {},
};

export const executeReplyMessage: IExecuteReplyMsg = {
    channel: "shell",
    content: {
        execution_count: 1,
        status: "ok",
        user_expressions: {},
    },
    header: {
        msg_type: "execute_reply",
        msg_id: "123",
        session: "123",
        username: "test",
        version: "1.0",
        date: "2021-01-01",
    },
    metadata: {},
    parent_header: {
        date: "2021-01-01",
        msg_id: "123",
        msg_type: "execute_request",
        session: "123",
        version: "1.0",
        username: "test",
    },
};

export const executeRequestMessage: IExecuteRequestMsg = {
    channel: "shell",
    content: {
        code: 'print("Hello, World!")',
        silent: false,
        store_history: true,
        user_expressions: {},
        allow_stdin: true,
    },
    header: {
        msg_type: "execute_request",
        msg_id: "123",
        session: "123",
        username: "test",
        version: "1.0",
        date: "2021-01-01",
    },
    metadata: {},
    parent_header: {},
};

export const editorContext = {
    ready: Promise.resolve(),
    path: "test-path",
    localPath: "test-local-path",
    addSibling: jest.fn(),
    dispose: jest.fn(),
    isDisposed: false,
    sessionContext: {
        ready: Promise.resolve(),
        kernelChanged: {
            connect: jest.fn(),
        },
        statusChanged: {
            connect: jest.fn(),
        },
        iopubMessage: {
            connect: jest.fn(),
        },
        propertyChanged: {
            connect: jest.fn(),
        },
        kernel: {
            status: "idle",
            info: {
                language_info: {
                    name: "python",
                },
            },
        },
    },
    model: {
        contentChanged: {
            connect: jest.fn(),
        },
        stateChanged: {
            connect: jest.fn(),
        },
        mimeTypeChanged: {
            connect: jest.fn(),
        },
        value: {
            changed: {
                connect: jest.fn(),
            },
        },
        toString: () => '{"type": "flow"}',
    },
    pathChanged: {
        connect: jest.fn(),
    },
    toolbar: {
        addItem: jest.fn(),
        insertItem: jest.fn(),
        removeItem: jest.fn(),
        names: jest.fn(),
        widgets: [],
    },
} as any;
export const mockEditor = {
    toolbar: {
        addItem: jest.fn(),
        insertItem: jest.fn(),
        removeItem: jest.fn(),
        names: jest.fn(),
        widgets: [],
    },
    dispose: jest.fn(),
    isDisposed: false,
    node: document.createElement("div"),
    context: editorContext,
};
export const mockFetch = (data: string, error: boolean) => {
    // noinspection JSUnusedGlobalSymbols
    window.Request = jest.fn().mockImplementation(() => ({
        headers: new Headers(),
        signal: {
            removeEventListener: () => {},
            addEventListener: () => {},
        },
    }));
    if (error) {
        window.fetch = jest.fn().mockImplementation(() => {
            return Promise.reject(new Error(data.length > 0 ? data : "error"));
        });
    } else {
        window.fetch = jest.fn().mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                text: () => data,
                json: () => JSON.parse(data),
            });
        });
    }
};

export const patchServerConnection = (responseText: string, error: boolean) => {
    mockFetch(responseText, error);
};
