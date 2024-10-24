import { IEditorServices } from '@jupyterlab/codeeditor';
import {
    ABCWidgetFactory,
    DocumentModel,
    DocumentRegistry
} from '@jupyterlab/docregistry';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';

import { CommandRegistry } from '@lumino/commands';
import { SplitPanel } from '@lumino/widgets';

import { FACTORY_NAME } from './constants';
import { WaldiezEditor } from './editor';

/**
 * A widget factory to create new instances of WaldiezEditor.
 * It is used to create a new widget given a context.
 * It is also used to get a factory of WaldiezEditor.
 * @public
 * @extends ABCWidgetFactory
 * @param <WaldiezEditor> The type of widget to create
 * @param <DocumentModel> The type of model to use
 */
export class WaldiezEditorFactory extends ABCWidgetFactory<
    WaldiezEditor,
    DocumentModel
> {
    private _commands: CommandRegistry;
    private _rendermime: IRenderMimeRegistry;
    private _editorServices: IEditorServices;
    private _settingRegistry: ISettingRegistry;

    /**
     * Constructor of WaldiezEditorFactory.
     *
     * @param options Constructor options
     * @memberof WaldiezEditorFactory
     * @public
     */
    constructor(options: WaldiezEditorFactory.IOptions) {
        super(options);
        this._commands = options.commands;
        this._rendermime = options.rendermime;
        this._editorServices = options.editorServices;
        this._settingRegistry = options.settingRegistry;
    }

    /**
     * Get the name of the factory.
     *
     * @returns The name of the factory
     * @memberof WaldiezEditorFactory
     * @public
     * @readonly
     */
    get name(): string {
        return FACTORY_NAME;
    }

    /**
     * Create a new widget given a context.
     *
     * @param context Contains the information of the file
     * @returns The widget
     * @memberof WaldiezEditorFactory
     */
    protected createNewWidget(
        context: DocumentRegistry.IContext<DocumentModel>
    ): WaldiezEditor {
        const panel = new SplitPanel({
            orientation: 'vertical',
            alignment: 'start',
            spacing: 0
        });
        panel.title.label = 'Waldie';
        panel.title.closable = true;
        const editor = new WaldiezEditor({
            context,
            rendermime: this._rendermime,
            editorServices: this._editorServices,
            settingregistry: this._settingRegistry,
            content: panel,
            commands: this._commands
        });
        return editor;
    }
}

/**
 * Namespace for WaldiezEditorFactory.
 * It contains the IOptions interface.
 * @namespace WaldiezEditorFactory
 * @public
 */
export namespace WaldiezEditorFactory {
    export interface IOptions extends DocumentRegistry.IWidgetFactoryOptions {
        translator?: ITranslator;
        rendermime: IRenderMimeRegistry;
        editorServices: IEditorServices;
        settingRegistry: ISettingRegistry;
        commands: CommandRegistry;
    }
}
