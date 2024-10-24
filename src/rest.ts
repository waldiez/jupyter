import { URLExt } from '@jupyterlab/coreutils';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { ServerConnection } from '@jupyterlab/services';

/**
 * Request the server to export the selected files to a specific extension.
 * @param fileBrowserFactory The file browser factory
 * @param extension The extension to export to: 'py' or 'ipynb'
 */
export const handleExport = async (
    fileBrowserFactory: IFileBrowserFactory,
    extension: 'py' | 'ipynb'
) => {
    const files = [];
    const selectedItems =
        fileBrowserFactory.tracker.currentWidget?.selectedItems();
    if (selectedItems) {
        for (const selectedItem of selectedItems) {
            if (selectedItem.name.endsWith('.waldiez')) {
                files.push(selectedItem.path);
            }
        }
    }
    if (files.length > 0) {
        await _requestFilesExport(files, extension);
    }
};

/**
 * Request server to get the actual path of a file.
 * @param path The relative (to the notebooks path setting) path of the file.
 * @throws {ServerConnection.NetworkError} If the request fails
 * @throws {ServerConnection.ResponseError} If the response is not ok
 * @returns The actual path on the server of the file
 */
export const getWaldiezActualPath = async (path: string) => {
    const settings = ServerConnection.makeSettings();
    const requestUrl = URLExt.join(
        settings.baseUrl,
        'waldiez',
        'files',
        '?path=' + path
    );
    let response: Response;
    try {
        response = await ServerConnection.makeRequest(
            requestUrl,
            {
                method: 'GET'
            },
            settings
        );
    } catch (error) {
        throw new ServerConnection.NetworkError(error as any);
    }
    const data: any = await response.text();
    let jsonData: any;
    if (data.length > 0) {
        try {
            jsonData = JSON.parse(data);
        } catch (_) {
            throw new Error('Not a JSON response body.');
        }
    }

    if (!response.ok) {
        throw new ServerConnection.ResponseError(
            response,
            data.message || data
        );
    }
    if (!jsonData) {
        throw new Error('No data returned from the server');
    }
    return jsonData.path;
};

/**
 * Upload a file to the server.
 * @param file The file to upload
 * @throws {ServerConnection.NetworkError} If the request fails
 * @throws {ServerConnection.ResponseError} If the response is not ok
 * @returns The path of the uploaded file on the server
 */
export const uploadFile = async (file: File) => {
    const settings = ServerConnection.makeSettings();
    const requestUrl = URLExt.join(settings.baseUrl, 'waldiez', 'upload');
    let response: Response;
    try {
        const formData = new FormData();
        formData.append('file', file);
        response = await ServerConnection.makeRequest(
            requestUrl,
            {
                body: formData,
                method: 'POST'
            },
            settings
        );
    } catch (error) {
        throw new ServerConnection.NetworkError(error as any);
    }
    const data: any = await response.text();
    if (data.length > 0) {
        try {
            JSON.parse(data);
        } catch (_) {
            throw new Error('Not a JSON response body.');
        }
    }
    let jsonData: any;
    if (!response.ok) {
        throw new ServerConnection.ResponseError(
            response,
            data.message || data
        );
    }
    if (data.length > 0) {
        try {
            jsonData = JSON.parse(data);
        } catch (_) {
            throw new Error('Not a JSON response body.');
        }
    }
    return jsonData.path;
};

/**
 * Request the server to export the selected files to a specific extension.
 * @param files The list of files to export
 * @param extension The extension to export to
 * @throws {ServerConnection.NetworkError} If the request fails
 * @throws {ServerConnection.ResponseError} If the response is not ok
 * @private
 */
const _requestFilesExport = async (
    files: Array<string>,
    extension: 'py' | 'ipynb'
) => {
    const settings = ServerConnection.makeSettings();
    const requestUrl = URLExt.join(settings.baseUrl, 'waldiez', 'files');
    let response: Response;
    try {
        response = await ServerConnection.makeRequest(
            requestUrl,
            {
                body: JSON.stringify({ files, extension }),
                method: 'POST'
            },
            settings
        );
    } catch (error) {
        throw new ServerConnection.NetworkError(error as any);
    }
    const data: any = await response.text();
    if (data.length > 0) {
        try {
            JSON.parse(data);
        } catch (_) {
            console.log('Not a JSON response body.', response);
        }
    }

    if (!response.ok) {
        throw new ServerConnection.ResponseError(
            response,
            data.message || data
        );
    }
};
