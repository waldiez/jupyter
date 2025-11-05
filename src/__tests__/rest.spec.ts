/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import {
    afterInterrupt,
    getWaldiezActualPath,
    handleConvert,
    handleExport,
    handleGetCheckpoints,
    uploadFile,
} from "../rest";
import { mockFetch } from "./utils";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import { ServerConnection } from "@jupyterlab/services";

type MockResp = {
    ok?: boolean;
    status?: number;
    body?: string;
    reject?: boolean; // simulate network error (reject promise)
};

const mockServer = (resp: MockResp) => {
    jest.spyOn(ServerConnection, "makeSettings").mockReturnValue({ baseUrl: "/" } as any);

    jest.spyOn(ServerConnection, "makeRequest").mockImplementation(async () => {
        if (resp.reject) {
            throw new Error("error");
        }
        return {
            ok: resp.ok ?? true,
            status: resp.status ?? 200,
            text: async () => resp.body ?? "",
        } as any;
    });
};

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
        jest.restoreAllMocks();
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
            patchServerConnection("", true);
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
        await expect(uploadFile(file)).rejects.toThrow('{"message": "Upload failed"}');
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
    it("handleExport posts selected .waldiez files with the extension", async () => {
        const fileBrowserFactory = {
            tracker: {
                currentWidget: {
                    selectedItems: () => [
                        { path: "a/file.waldiez", name: "file.waldiez" },
                        { path: "b/skip.py", name: "skip.py" },
                        { path: "c/flow.waldiez", name: "flow.waldiez" },
                    ],
                    model: { refresh: jest.fn() },
                },
            },
        } as unknown as IFileBrowserFactory;

        const makeRequestSpy = jest
            .spyOn(ServerConnection, "makeRequest")
            .mockResolvedValue({ ok: true, text: async () => "" } as any);
        jest.spyOn(ServerConnection, "makeSettings").mockReturnValue({ baseUrl: "/" } as any);

        await handleExport(fileBrowserFactory, "ipynb");

        // One POST call to /waldiez/files with expected JSON body
        expect(makeRequestSpy).toHaveBeenCalledTimes(1);
        const [, init] = makeRequestSpy.mock.calls[0];
        expect(init?.method).toBe("POST");
        const sent = JSON.parse(init!.body as string);
        expect(sent).toEqual({ files: ["a/file.waldiez", "c/flow.waldiez"], extension: "ipynb" });

        expect(fileBrowserFactory.tracker.currentWidget?.model.refresh).toHaveBeenCalled();
    });
    it("handleConvert posts a single file with the extension", async () => {
        const makeRequestSpy = jest
            .spyOn(ServerConnection, "makeRequest")
            .mockResolvedValue({ ok: true, text: async () => "" } as any);
        jest.spyOn(ServerConnection, "makeSettings").mockReturnValue({ baseUrl: "/" } as any);

        await handleConvert("x/one.waldiez", "py");

        expect(makeRequestSpy).toHaveBeenCalledTimes(1);
        const [, init] = makeRequestSpy.mock.calls[0];
        const sent = JSON.parse(init!.body as string);
        expect(sent).toEqual({ files: ["x/one.waldiez"], extension: "py" });
    });
    describe("handleGetCheckpoints", () => {
        it("returns parsed JSON on success", async () => {
            mockServer({ ok: true, body: '{"foo": "bar"}' });
            await expect(handleGetCheckpoints("flow-1")).resolves.toEqual({ foo: "bar" });
        });

        it("returns null on network error and warns", async () => {
            const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
            mockServer({ reject: true });
            await expect(handleGetCheckpoints("flow-1")).resolves.toBeNull();
            expect(warn).toHaveBeenCalled();
        });

        it("throws on invalid JSON", async () => {
            mockServer({ ok: true, body: "not-json" });
            await expect(handleGetCheckpoints("flow-1")).rejects.toThrow("Not a JSON response body.");
        });

        it("throws ResponseError when !ok", async () => {
            mockServer({ ok: false, status: 500, body: '{"message":"boom"}' });
            await expect(handleGetCheckpoints("flow-1")).rejects.toThrow(/boom|ResponseError/);
        });
    });
    it("afterInterrupt schedules a gather request after 2s", async () => {
        jest.useFakeTimers();

        const makeReq = jest
            .spyOn(ServerConnection, "makeRequest")
            .mockResolvedValue({ ok: true, text: async () => "" } as any);
        jest.spyOn(ServerConnection, "makeSettings").mockReturnValue({ baseUrl: "/" } as any);

        afterInterrupt();
        expect(makeReq).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1999);
        expect(makeReq).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(makeReq).toHaveBeenCalledTimes(1);
        const [url, init] = makeReq.mock.calls[0];
        expect(String(url)).toBe("/waldiez/gather");
        expect(init?.method).toBe("GET");
    });
    describe("handleGetCheckpoints", () => {
        it("returns parsed JSON on success", async () => {
            mockServer({ ok: true, body: '{"foo": "bar"}' });
            await expect(handleGetCheckpoints("flow-1")).resolves.toEqual({ foo: "bar" });
        });

        it("returns null on network error and warns", async () => {
            const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
            mockServer({ reject: true });
            await expect(handleGetCheckpoints("flow-1")).resolves.toBeNull();
            expect(warn).toHaveBeenCalled();
        });

        it("throws on invalid JSON", async () => {
            mockServer({ ok: true, body: "not-json" });
            await expect(handleGetCheckpoints("flow-1")).rejects.toThrow("Not a JSON response body.");
        });

        it("throws ResponseError when !ok", async () => {
            mockServer({ ok: false, status: 500, body: '{"message":"boom"}' });
            await expect(handleGetCheckpoints("flow-1")).rejects.toThrow(/boom|ResponseError/);
        });
    });
    it("getWaldiezActualPath returns .path from JSON", async () => {
        mockServer({ ok: true, body: '{"path":"real/path"}' });
        await expect(getWaldiezActualPath("rel")).resolves.toBe("real/path");
    });
});
