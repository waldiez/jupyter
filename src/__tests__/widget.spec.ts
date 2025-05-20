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
        // chat: {
        //     showUI: false,
        //     messages: [],
        //     userParticipants: [],
        // },
    };

    it("should render the EditorWidget", () => {
        const widget = new EditorWidget(defaultProps);
        expect(widget).toBeTruthy();
        widget.render();
        widget.dispose();
    });
    it("should handle input prompt signal", () => {
        const widget = new EditorWidget(defaultProps);
        widget.render();
        // chat.emit({
        //     messages: ["Hello"],
        //     prompt: "Test Prompt",
        // });
        expect(widget.render()).toBeTruthy();
        widget.dispose();
    });
});
