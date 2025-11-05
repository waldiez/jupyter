/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import {
    copyToClipboard,
    getCodeToExecute,
    getUploadsRoot,
    normalizeLogEntry,
    parseRequestId,
    strip_ansi,
} from "../../runner/common";

// Mock navigator.clipboard for clipboard tests
const mockClipboard = {
    writeText: jest.fn(),
};

Object.defineProperty(navigator, "clipboard", {
    value: mockClipboard,
    writable: true,
});

Object.defineProperty(window, "isSecureContext", {
    value: true,
    writable: true,
});

describe("common utility functions", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getCodeToExecute", () => {
        it("should generate correct code for standard mode", () => {
            const filePath = "/path/to/test.waldiez";
            const mode = "standard";

            const result = getCodeToExecute(filePath, mode);

            expect(result).toContain("from pathlib import Path");
            expect(result).toContain("from waldiez import WaldiezRunner");
            expect(result).toContain(`file_path = Path(r"${filePath}").as_posix()`);
            expect(result).toContain('uploads_root = Path(file_path).parent / "uploads"');
            expect(result).toContain(`runner = WaldiezRunner.load(waldiez_file=file_path, mode="${mode}")`);
            expect(result).toContain("runner.run(uploads_root=uploads_root, structured_io=True");
        });

        it("should generate correct code for debug mode", () => {
            const filePath = "/path/to/debug.waldiez";
            const mode = "debug";

            const result = getCodeToExecute(filePath, mode);

            expect(result).toContain(`runner = WaldiezRunner.load(waldiez_file=file_path, mode="${mode}")`);
            expect(result).toContain("structured_io=True");
        });

        it("should handle Windows-style paths", () => {
            const filePath = "C:\\Users\\test\\flow.waldiez";
            const mode = "standard";

            const result = getCodeToExecute(filePath, mode);

            expect(result).toContain(`file_path = Path(r"${filePath}").as_posix()`);
        });

        it("should include dot env handling", () => {
            const filePath = "/path/to/test.waldiez";
            const mode = "standard";

            const result = getCodeToExecute(filePath, mode);

            expect(result).toContain('dot_env_path = Path(file_path).parent / ".env"');
            expect(result).toContain('cwd_dot_env_path = Path.cwd() / ".env"');
            expect(result).toContain("if dot_env_path.exists():");
            expect(result).toContain("elif cwd_dot_env_path.exists():");
            expect(result).toContain("else:");
        });
    });

    describe("getUploadsRoot", () => {
        it("should return correct uploads path for Unix-style paths", () => {
            const filePath = "/path/to/test.waldiez";
            const result = getUploadsRoot(filePath);
            expect(result).toBe("/path/to/uploads");
        });

        it("should return correct uploads path for Windows-style paths", () => {
            const filePath = "C:\\Users\\test\\flow.waldiez";
            const result = getUploadsRoot(filePath);
            expect(result).toBe("C:\\Users\\test\\uploads");
        });

        it("should handle root directory files", () => {
            const filePath = "/test.waldiez";
            const result = getUploadsRoot(filePath);
            expect(result).toBe("/uploads");
        });

        it("should handle current directory when no separator found", () => {
            const filePath = "test.waldiez";
            const result = getUploadsRoot(filePath);
            expect(result).toBe("./uploads");
        });

        it("should handle mixed separators", () => {
            const filePath = "/path\\to/test.waldiez";
            const result = getUploadsRoot(filePath);
            expect(result).toBe("/path\\to/uploads");
        });

        it("should handle empty path", () => {
            const filePath = "";
            const result = getUploadsRoot(filePath);
            expect(result).toBe("uploads");
        });

        it("should detect trailing separator", () => {
            const filePath = "/path/to/test.waldiez/";
            const result = getUploadsRoot(filePath);
            expect(result).toBe("/path/to/test.waldiez/uploads");
        });
    });

    describe("strip_ansi", () => {
        it("should remove basic ANSI escape sequences", () => {
            const input = "\u001b[31mRed text\u001b[0m";
            const result = strip_ansi(input);
            expect(result).toBe("Red text");
        });

        it("should remove complex ANSI escape sequences", () => {
            const input = "\u001b[38;5;196mBright red\u001b[0m";
            const result = strip_ansi(input);
            expect(result).toBe("Bright red");
        });

        it("should handle text without ANSI codes", () => {
            const input = "Normal text";
            const result = strip_ansi(input);
            expect(result).toBe("Normal text");
        });

        it("should remove multiple ANSI sequences", () => {
            const input = "\u001b[31mRed\u001b[0m and \u001b[32mGreen\u001b[0m";
            const result = strip_ansi(input);
            expect(result).toBe("Red and Green");
        });

        it("should handle cursor movement codes", () => {
            const input = "\u001b[2AMove up\u001b[1BMove down";
            const result = strip_ansi(input);
            expect(result).toBe("Move upMove down");
        });

        it("should handle empty string", () => {
            const result = strip_ansi("");
            expect(result).toBe("");
        });
    });

    describe("normalizeLogEntry", () => {
        it("should split multiline entries", () => {
            const entry = "Line 1\nLine 2\nLine 3";
            const result = normalizeLogEntry(entry);
            expect(result).toEqual(["Line 1", "Line 2", "Line 3"]);
        });

        it("should remove empty lines", () => {
            const entry = "Line 1\n\nLine 2\n   \nLine 3";
            const result = normalizeLogEntry(entry);
            expect(result).toEqual(["Line 1", "Line 2", "Line 3"]);
        });

        it("should trim trailing spaces", () => {
            const entry = "Line 1   \nLine 2\t\nLine 3 ";
            const result = normalizeLogEntry(entry);
            expect(result).toEqual(["Line 1", "Line 2", "Line 3"]);
        });

        it("should unwrap JSON quoted strings", () => {
            const entry = '"This is a JSON string"';
            const result = normalizeLogEntry(entry);
            expect(result).toEqual(["This is a JSON string"]);
        });

        it("should handle escaped characters in JSON strings", () => {
            const entry = '"Line 1\\nLine 2\\tTabbed"';
            const result = normalizeLogEntry(entry);
            expect(result).toEqual(["Line 1", "Line 2\tTabbed"]);
        });

        it("should remove timestamps when keepTimestamps is false", () => {
            const entry = "12:34:56 PM This is a message\n01:23:45 AM Another message";
            const result = normalizeLogEntry(entry, { keepTimestamps: false });
            expect(result).toEqual(["This is a message", "Another message"]);
        });

        it("should keep timestamps when keepTimestamps is true", () => {
            const entry = "12:34:56 PM This is a message";
            const result = normalizeLogEntry(entry, { keepTimestamps: true });
            expect(result).toEqual(["12:34:56 PM This is a message"]);
        });

        it("should handle malformed JSON gracefully", () => {
            const entry = '"Unclosed JSON string';
            const result = normalizeLogEntry(entry);
            expect(result).toEqual(['"Unclosed JSON string']);
        });

        it("should return empty array for empty input", () => {
            const result = normalizeLogEntry("");
            expect(result).toEqual([]);
        });

        it("should handle complex escaped strings", () => {
            const entry = '"Message with \\"quotes\\" and \\\\backslashes"';
            const result = normalizeLogEntry(entry);
            expect(result).toEqual(['Message with "quotes" and \\backslashes']);
        });
    });

    describe("copyToClipboard", () => {
        beforeEach(() => {
            mockClipboard.writeText.mockClear();
            // Mock document methods
            document.createElement = jest.fn().mockReturnValue({
                value: "",
                style: { cssText: "" },
                focus: jest.fn(),
                select: jest.fn(),
            });
            document.body.appendChild = jest.fn();
            document.body.removeChild = jest.fn();
            // noinspection JSDeprecatedSymbols
            document.execCommand = jest.fn();
        });

        it("should use modern clipboard API when available", async () => {
            mockClipboard.writeText.mockResolvedValue(undefined);

            const result = await copyToClipboard("test text");

            expect(result).toBe(true);
            expect(mockClipboard.writeText).toHaveBeenCalledWith("test text");
        });

        it("should fall back to execCommand when clipboard API fails", async () => {
            const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
            mockClipboard.writeText.mockRejectedValue(new Error("Clipboard failed"));
            // noinspection JSDeprecatedSymbols
            document.execCommand = jest.fn().mockReturnValue(true);

            const result = await copyToClipboard("test text");

            expect(result).toBe(true);
            expect(document.createElement).toHaveBeenCalledWith("textarea");
            // noinspection JSDeprecatedSymbols
            expect(document.execCommand).toHaveBeenCalledWith("copy", false);
            expect(consoleWarnSpy).toHaveBeenCalledWith("Clipboard API failed:", expect.any(Error));
            consoleWarnSpy.mockRestore();
        });

        it("should fall back when not in secure context", async () => {
            Object.defineProperty(window, "isSecureContext", {
                value: false,
                writable: true,
            });
            // noinspection JSDeprecatedSymbols
            document.execCommand = jest.fn().mockReturnValue(true);

            const result = await copyToClipboard("test text");

            expect(result).toBe(true);
            expect(mockClipboard.writeText).not.toHaveBeenCalled();
        });

        it("should return false when all methods fail", async () => {
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
            mockClipboard.writeText.mockRejectedValue(new Error("Failed"));
            // noinspection JSDeprecatedSymbols
            document.execCommand = jest.fn().mockReturnValue(false);

            const result = await copyToClipboard("test text");

            expect(result).toBe(false);
            consoleErrorSpy.mockRestore();
        });
    });

    describe("parseRequestId", () => {
        it("should parse request ID from debug_input_request", () => {
            const message = '{"type": "debug_input_request", "request_id": "abc123", "data": "test"}';
            const result = parseRequestId(message);
            expect(result).toBe("abc123");
        });

        it("should parse request ID from input_request", () => {
            const message = '{"type": "input_request", "request_id": "xyz789"}';
            const result = parseRequestId(message);
            expect(result).toBe("xyz789");
        });

        it("should handle single quotes", () => {
            const message = "{'type': 'input_request', 'request_id': 'def456'}";
            const result = parseRequestId(message);
            expect(result).toBe("def456");
        });

        it("should handle mixed quotes", () => {
            const message = "{\"type\": 'input_request', \"request_id\": 'ghi789'}";
            const result = parseRequestId(message);
            expect(result).toBe("ghi789");
        });

        it("should handle no quotes on key", () => {
            const message = '{type: "input_request", request_id: "jkl012"}';
            const result = parseRequestId(message);
            expect(result).toBe("jkl012");
        });

        it("should return undefined for non-input-request types", () => {
            const message = '{"type": "other_type", "request_id": "abc123"}';
            const result = parseRequestId(message);
            expect(result).toBeUndefined();
        });

        it("should return undefined when no request_id found", () => {
            const message = '{"type": "input_request", "data": "test"}';
            const result = parseRequestId(message);
            expect(result).toBeUndefined();
        });

        it("should return undefined for invalid JSON", () => {
            const message = "not json";
            const result = parseRequestId(message);
            expect(result).toBeUndefined();
        });

        it("should handle complex nested structures", () => {
            const message =
                '{"type": "input_request", "nested": {"other": "value"}, "request_id": "nested123"}';
            const result = parseRequestId(message);
            expect(result).toBe("nested123");
        });

        it("should prioritize first match when multiple patterns exist", () => {
            const message = '{"type": "input_request", "request_id": "first", "other_request_id": "second"}';
            const result = parseRequestId(message);
            expect(result).toBe("first");
        });

        it("should handle empty string", () => {
            const result = parseRequestId("");
            expect(result).toBeUndefined();
        });

        it("should handle whitespace in JSON", () => {
            const message = `{
                "type": "input_request",
                "request_id": "whitespace123"
            }`;
            const result = parseRequestId(message);
            expect(result).toBe("whitespace123");
        });
    });
});
