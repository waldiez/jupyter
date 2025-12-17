/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { EditorWidget, type IWaldiezWidgetProps } from "../widget";
import { Signal } from "@lumino/signaling";

import type { WaldiezChatConfig, WaldiezStepByStep } from "@waldiez/react";

const waldiezFlow = {
    type: "flow",
    name: "Test Flow",
    description: "Test Description",
    requirements: [],
    tags: [],
    edges: [],
    nodes: [],
    viewport: {},
    storageId: "test-storage-id",
};
jest.mock("@waldiez/react", () => ({
    importFlow: jest.fn(() => waldiezFlow),
}));

describe("EditorWidget", () => {
    let signal: Signal<
        any,
        { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }
    >;
    // let chat: Signal<any, WaldiezChatConfig | undefined>;
    // let stepByStep: Signal<any, WaldiezStepByStep | undefined>;

    beforeEach(() => {
        signal = new Signal<
            any,
            { chat: WaldiezChatConfig | undefined; stepByStep: WaldiezStepByStep | undefined }
        >({});
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    const defaultProps: IWaldiezWidgetProps = {
        flowId: "test-flow-id",
        vsPath: undefined,
        jsonData: waldiezFlow,
        signal: signal!,
        onSave: jest.fn(),
        onRun: jest.fn(),
        onStepRun: jest.fn(),
    };

    it("should render the EditorWidget", () => {
        const widget = new EditorWidget(defaultProps);
        expect(widget).toBeTruthy();
        widget.render();
        widget.dispose();
    });
    it("should handle chat signal", () => {
        const widget = new EditorWidget(defaultProps);

        // Test with null chat (should use undefined)
        signal.emit({ chat: undefined, stepByStep: undefined });
        let renderResult = widget.render();
        expect(renderResult).toBeDefined();

        // Test with actual chat config (should use the chat value)
        const chatConfig: WaldiezChatConfig = {
            show: true,
            active: true,
            messages: [],
            timeline: undefined,
            userParticipants: [],
            activeRequest: undefined,
        };
        signal.emit({ chat: chatConfig, stepByStep: undefined });
        renderResult = widget.render();
        expect(renderResult).toBeDefined();

        widget.dispose();
    });
});
