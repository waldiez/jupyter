/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { getWaldiezActualPath, handleConvert, handleExport, uploadFile } from "../rest";
import { mockFetch } from "./utils";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";

const patchServerConnection = (responseText: string, error: boolean) => {
    mockFetch(responseText, error);
    jest.mock("@jupyterlab/services", () => {
        return {
            ServerConnection: {
                makeRequest: jest.fn().mockResolvedValue({
                    text: jest.fn().mockResolvedValue(responseText),
                }),
            },
        };
    });
};

describe("rest module", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe("handleExport", () => {
        it("should not break if no files are selected", async () => {
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [],
                        model: {
                            refresh: jest.fn(),
                        },
                    },
                },
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, "py");
        });
        it("should not break if no .waldiez files are selected", async () => {
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: "path/to/file.py",
                                name: "file.py",
                            },
                        ],
                        model: {
                            refresh: jest.fn(),
                        },
                    },
                },
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, "py");
        });
        it("should throw request fails", async () => {
            patchServerConnection('{"path": "path/to/file.py"}', true);
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: "path/to/file.waldiez",
                                name: "file.waldiez",
                            },
                        ],
                        model: {
                            refresh: jest.fn(),
                        },
                    },
                },
            } as unknown as IFileBrowserFactory;
            await expect(handleExport(fileBrowserFactory, "py")).rejects.toThrow("error");
        });
        it("should request file export to py for selected .waldiez files", async () => {
            patchServerConnection('{"path": "path/to/file.py"}', false);
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: "path/to/file.waldiez",
                                name: "file.waldiez",
                            },
                        ],
                        model: {
                            refresh: jest.fn(),
                        },
                    },
                },
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, "py");
            expect(fileBrowserFactory.tracker.currentWidget?.model.refresh).toHaveBeenCalled();
        });
        it("should request file export to ipynb for all .waldiez files", async () => {
            patchServerConnection('{"path": "path/to/file.ipynb"}', false);
            const fileBrowserFactory = {
                tracker: {
                    currentWidget: {
                        selectedItems: () => [
                            {
                                path: "path/to/file.waldiez",
                                name: "file.waldiez",
                            },
                        ],
                        model: {
                            refresh: jest.fn(),
                        },
                    },
                },
            } as unknown as IFileBrowserFactory;
            await handleExport(fileBrowserFactory, "ipynb");
        });
    });
    describe("getWaldiezActualPath", () => {
        it("should throw an error if no data is received", async () => {
            patchServerConnection("", false);
            await expect(getWaldiezActualPath("path")).rejects.toThrow("No data returned from the server");
        });
        it("should throw a response error if the response is not ok", async () => {
            patchServerConnection("", true);
            await expect(getWaldiezActualPath("path")).rejects.toThrow("error");
        });
        it("should return the actual path of the file", async () => {
            patchServerConnection('{"path": "path"}', false);
            const path = await getWaldiezActualPath("path");
            expect(path).toBe("path");
        });
        it("should throw an error if the data is not a valid JSON", async () => {
            patchServerConnection("invalid json", false);
            await expect(getWaldiezActualPath("path")).rejects.toThrow("Not a JSON response body.");
        });
    });
    it("should handle handleExport with no currentWidget", async () => {
        const fileBrowserFactory = {
            tracker: {
                currentWidget: null,
            },
        } as unknown as IFileBrowserFactory;
        await handleExport(fileBrowserFactory, "py");
    });

    it("should handle uploadFile successfully", async () => {
        patchServerConnection('{"path": "uploaded/file/path"}', false);
        const file = new File(["content"], "test.txt");
        const path = await uploadFile(file);
        expect(path).toBe("uploaded/file/path");
    });

    it("should handle uploadFile with network error", async () => {
        patchServerConnection("", true);
        const file = new File(["content"], "test.txt");
        await expect(uploadFile(file)).rejects.toThrow("error");
    });

    it("should handle uploadFile with invalid JSON response", async () => {
        patchServerConnection("invalid json", false);
        const file = new File(["content"], "test.txt");
        await expect(uploadFile(file)).rejects.toThrow("Not a JSON response body.");
    });

    it("should handle uploadFile with response error", async () => {
        patchServerConnection('{"message": "Upload failed"}', true);
        const file = new File(["content"], "test.txt");
        await expect(uploadFile(file)).rejects.toThrow("error");
    });

    it("should handle _requestFilesExport with invalid JSON response", async () => {
        patchServerConnection("invalid json", false);
        const fileBrowserFactory = {
            tracker: {
                currentWidget: {
                    selectedItems: () => [
                        {
                            path: "path/to/file.waldiez",
                            name: "file.waldiez",
                        },
                    ],
                    model: {
                        refresh: jest.fn(),
                    },
                },
            },
        } as unknown as IFileBrowserFactory;

        const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        await handleExport(fileBrowserFactory, "py");
        expect(consoleLogSpy).toHaveBeenCalledWith("Not a JSON response body.", expect.any(Object));
        consoleLogSpy.mockRestore();
    });

    it("should handle getWaldiezActualPath with network error", async () => {
        patchServerConnection("", true);
        await expect(getWaldiezActualPath("path")).rejects.toThrow("error");
    });

    it("should handle handleConvert function", async () => {
        patchServerConnection('{"success": true}', false);
        await handleConvert("path/to/file.waldiez", "py");
    });
});
