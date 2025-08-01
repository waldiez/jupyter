/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { EditorWidget, IWaldiezWidgetProps } from "../widget";
import { Signal } from "@lumino/signaling";

import { WaldiezChatConfig } from "@waldiez/react";

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
    let chat: Signal<any, WaldiezChatConfig | undefined>;

    beforeEach(() => {
        chat = new Signal<any, WaldiezChatConfig | undefined>(undefined);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    const defaultProps: IWaldiezWidgetProps = {
        flowId: "test-flow-id",
        vsPath: undefined,
        jsonData: waldiezFlow,
        chat: chat!,
        onChange: jest.fn(),
        onRun: jest.fn(),
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
        chat.emit(undefined);
        let renderResult = widget.render();
        expect(renderResult).toBeDefined();

        // Test with actual chat config (should use the chat value)
        const chatConfig: WaldiezChatConfig = {
            showUI: true,
            messages: [],
            timeline: undefined,
            userParticipants: [],
            activeRequest: undefined,
        };

        chat.emit(chatConfig);
        renderResult = widget.render();
        expect(renderResult).toBeDefined();

        widget.dispose();
    });
});
