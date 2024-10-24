import { IFileBrowserFactory } from '@jupyterlab/filebrowser';

import { getWaldiezActualPath, handleExport } from '../rest';
import { mockFetch } from './utils';

const patchServerConnection = (responseText: string, error: boolean) => {
    mockFetch(responseText, error);
    jest.mock('@jupyterlab/services', () => {
        return {
            ServerConnection: {
                makeRequest: jest.fn().mockResolvedValue({
                    text: jest.fn().mockResolvedValue(responseText)
                })
            }
        };
    });
};

describe('rest module', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('handleExport', () => {
        it('should not break if no files are selected', async () => {
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => []
                    }
                }
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, 'py');
        });
        it('should not break if no .waldiez files are selected', async () => {
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: 'path/to/file.py',
                                name: 'file.py'
                            }
                        ]
                    }
                }
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, 'py');
        });
        it('should throw request fails', async () => {
            patchServerConnection('{"path": "path/to/file.py"}', true);
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: 'path/to/file.waldiez',
                                name: 'file.waldiez'
                            }
                        ]
                    }
                }
            } as unknown as IFileBrowserFactory;
            await expect(
                handleExport(fileBrowserFactory, 'py')
            ).rejects.toThrow('error');
        });
        it('should request file export to py for selected .waldiez files', async () => {
            patchServerConnection('{"path": "path/to/file.py"}', false);
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: 'path/to/file.waldiez',
                                name: 'file.waldiez'
                            }
                        ]
                    }
                }
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, 'py');
        });
        it('should request file export to ipynb for all .waldiez files', async () => {
            patchServerConnection('{"path": "path/to/file.ipynb"}', false);
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: 'path/to/file.waldiez',
                                name: 'file.waldiez'
                            }
                        ]
                    }
                }
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, 'ipynb');
        });
    });
    describe('getWaldiezActualPath', () => {
        it('should throw an error if no data is received', async () => {
            patchServerConnection('', false);
            await expect(getWaldiezActualPath('path')).rejects.toThrow(
                'No data returned from the server'
            );
        });
        it('should throw a response error if the response is not ok', async () => {
            patchServerConnection('', true);
            await expect(getWaldiezActualPath('path')).rejects.toThrow('error');
        });
        it('should return the actual path of the file', async () => {
            patchServerConnection('{"path": "path"}', false);
            const path = await getWaldiezActualPath('path');
            expect(path).toBe('path');
        });
        it('should throw an error if the data is not a valid JSON', async () => {
            patchServerConnection('invalid json', false);
            await expect(getWaldiezActualPath('path')).rejects.toThrow(
                'Not a JSON response body.'
            );
        });
    });
});
