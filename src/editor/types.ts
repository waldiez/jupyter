/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { Kernel } from "@jupyterlab/services";
import type { IInputRequestMsg } from "@jupyterlab/services/lib/kernel/messages";

import type { WaldiezChatConfig, WaldiezStepByStep } from "@waldiez/react";

/**
 * The state interface for the Waldiez editor.
 */
export interface IEditorState {
    chat: WaldiezChatConfig;
    stepByStep: WaldiezStepByStep;
    stdinRequest: IInputRequestMsg | null;
}

/**
 * The execution context interface for running Waldiez files.
 */
export interface IExecutionContext {
    kernel: Kernel.IKernelConnection;
    filePath: string;
    contents: string;
}
