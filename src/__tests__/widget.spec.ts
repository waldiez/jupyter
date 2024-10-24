import { Signal } from '@lumino/signaling';

import { EditorWidget, IWaldiezEditorProps } from '../widget';

const waldiezFlow = {
    name: 'Test Flow',
    description: 'Test Description',
    requirements: [],
    tags: [],
    edges: [],
    nodes: [],
    viewport: {},
    storageId: 'test-storage-id'
};
jest.mock('@waldiez/react', () => ({
    importFlow: jest.fn(() => waldiezFlow)
}));

describe('EditorWidget', () => {
    let inputPrompt: Signal<
        any,
        { previousMessages: string[]; prompt: string } | null
    >;

    beforeEach(() => {
        inputPrompt = new Signal<
            any,
            { previousMessages: string[]; prompt: string } | null
        >(null);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    const defaultProps: IWaldiezEditorProps = {
        flowId: 'test-flow-id',
        vsPath: null,
        jsonData: waldiezFlow,
        inputPrompt: inputPrompt!,
        onChange: jest.fn(),
        onRun: jest.fn(),
        onUserInput: jest.fn()
    };

    it('should render the EditorWidget', () => {
        const widget = new EditorWidget(defaultProps);
        expect(widget).toBeTruthy();
        widget.render();
        widget.dispose();
    });
    it('should handle input prompt signal', () => {
        const widget = new EditorWidget(defaultProps);
        widget.render();
        inputPrompt.emit({
            previousMessages: ['Hello'],
            prompt: 'Test Prompt'
        });
        expect(widget.render()).toBeTruthy();
        widget.dispose();
    });
});
