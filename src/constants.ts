export const NAMESPACE = '@waldiez/jupyter';
export const PLUGIN_ID = `${NAMESPACE}:plugin`;
export const FACTORY_NAME = 'Waldiez editor';
export const MONACO_PATH = '/static/vs';
export const WALDIEZ_FILE_TYPE = 'waldiez';
export const SERVE_MONACO = 'serve_monaco';
// strings
export namespace WALDIEZ_STRINGS {
    export const PLUGIN_DESCRIPTION = 'Waldiez JupyterLab extension.';
    export const WALDIEZ_FILE = 'Waldiez File';
    export const NEW_WALDIEZ_FILE = 'New Waldiez File';
    export const CAPTION = 'Create a new Waldiez file';
    export const TO_PYTHON = 'To python';
    export const TO_PYTHON_CAPTION = 'Export .waldiez to .py';
    export const TO_JUPYTER = 'To notebook';
    export const TO_JUPYTER_CAPTION = 'Export .waldiez to .ipynb';
    export const OPEN_WALDIEZ = 'Open Waldiez';
    export const ON_EMPTY_PROMPT = 'Enter your message to start the chat:';
    export const LOG_CONSOLE = 'Log Console';
    export const SHOW_LOGS = 'Show logs';
    export const CLEAR_LOGS = 'Clear Logs';
    export const HIDE_LOGS = 'Hide logs';
    export const RESTART_KERNEL = 'Restart kernel';
    export const INTERRUPT_KERNEL = 'Interrupt kernel';
    export const SHUTDOWN_KERNEL = 'Shutdown kernel';
    export const CHANGE_KERNEL = 'Change kernel';
    export const RECONNECT_TO_KERNEL = 'Reconnect to kernel';
    export const LOGGER_INITIALIZED = 'Waldiez logger initialized';
    export const STARTING_WORKFLOW = 'Starting workflow...';
    export const NO_KERNEL = 'No kernel';
    export const NO_KERNEL_MESSAGE =
        'Please start a kernel before running the workflow.';
    export const KERNEL_STATUS_CHANGED = (status: string) =>
        `Kernel status changed to ${status}`;
}
