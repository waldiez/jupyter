/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */

/**
 * Get the code to execute for a waldiez file.
 * @param filePath The path of the waldiez file
 * @param mode The mode to run the waldiez file in ("standard" or "debug")
 * @returns The code to execute
 */
export const getCodeToExecute = (
    filePath: string,
    mode: "standard" | "debug",
    breakpoints?: string[],
    checkpoint?: string | null,
) => {
    let breakpointsArg = "";
    if (mode === "debug" && breakpoints) {
        breakpointsArg = " breakpoints=[";
        breakpoints.forEach(bp => {
            breakpointsArg += `"${bp}",`;
        });
        if (breakpoints.length > 0) {
            breakpointsArg = breakpointsArg.slice(0, -1);
        }
        breakpointsArg += "],";
    }
    let checkpointArg = "";
    if (mode === "debug" && checkpoint) {
        checkpointArg = ` checkpoint="${checkpoint}",`;
    }
    return (
        "from pathlib import Path\n" +
        "from waldiez import WaldiezRunner\n" +
        `file_path = Path(r"${filePath}").as_posix()\n` +
        'uploads_root = Path(file_path).parent / "uploads"\n' +
        'dot_env_path = Path(file_path).parent / ".env"\n' +
        'cwd_dot_env_path = Path.cwd() / ".env"\n' +
        `runner = WaldiezRunner.load(waldiez_file=file_path,${breakpointsArg}${checkpointArg} mode="${mode}")\n` +
        "if dot_env_path.exists():\n" +
        "    runner.run(uploads_root=uploads_root, structured_io=True, dot_env=dot_env_path.resolve())\n" +
        "elif cwd_dot_env_path.exists():\n" +
        "    runner.run(uploads_root=uploads_root, structured_io=True, dot_env=cwd_dot_env_path.resolve())\n" +
        "else:\n" +
        "    runner.run(uploads_root=uploads_root, structured_io=True)\n"
    );
};

/**
 * Get the uploads root directory.
 *
 * Examples:
 *  - "/a/b/c.txt"            -> "/a/b/uploads"
 *  - "/a/b/"                 -> "/a/b/uploads"
 *  - "C:\\a\\b\\c.txt"       -> "C:\\a\\b\\uploads"
 *  - "C:\\a\\b\\"            -> "C:\\a\\b\\uploads"
 *  - "a/b/c.txt"             -> "a/b/uploads"
 *  - "c.txt"                 -> "./uploads"
 *  - "/"                     -> "/uploads"
 *  - "\\\\server\\share\\"   -> "\\\\server\\share\\uploads"
 */
export const getUploadsRoot = (filePath: string): string => {
    if (!filePath) {
        return "uploads";
    }

    // Remove query/hash fragments (if a URL-like string slipped in)
    const clean = filePath.split(/[?#]/)[0];

    const lastFwd = clean.lastIndexOf("/");
    const lastBack = clean.lastIndexOf("\\");
    const lastSep = Math.max(lastFwd, lastBack);

    const endsWithSep = /[\\/]+$/.test(clean);
    // Prefer the actual last separator seen; default to "/" if none found
    const sep = lastSep >= 0 ? clean[lastSep] : "/";

    let baseDir: string;

    if (endsWithSep) {
        // It's already a directory path; trim trailing slashes
        const trimmed = clean.replace(/[\\/]+$/, "");
        if (trimmed === "") {
            // Root like "/" or "\\" -> return "<root>uploads"
            return sep + "uploads";
        }
        baseDir = trimmed;
    } else {
        // It's a file path or a single segment
        baseDir = lastSep >= 0 ? clean.slice(0, lastSep) : ".";
    }

    // Ensure exactly one separator before "uploads"
    return baseDir.endsWith("/") || baseDir.endsWith("\\") ? baseDir + "uploads" : baseDir + sep + "uploads";
};

/**
 * Remove ANSI escape sequences from a string.
 * @param str The string to remove ANSI escape sequences from
 * @returns The string without ANSI escape sequences
 * @private
 * @memberof WaldiezStandardRunner
 */
export const strip_ansi = (str: string): string => {
    // return str.replace(/\u001b\[[0-9;]*m/g, "");
    // eslint-disable-next-line no-control-regex
    return str.replace(/\u001b\[[\x20-\x3f]*[\x40-\x7e]/g, "");
};

const isJSONQuotedString = (s: string): boolean => {
    return s.length >= 2 && s.startsWith('"') && s.endsWith('"');
};

const tryUnwrapJSONString = (s: string): string => {
    if (isJSONQuotedString(s)) {
        try {
            const parsed = JSON.parse(s);
            if (typeof parsed === "string") {
                return parsed;
            }
        } catch {
            // ignore
        }
    }
    // fallback: gentle manual unescape
    let t = s;
    if (isJSONQuotedString(t)) {
        t = t.slice(1, -1);
    }
    return t.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
};

/**
 * Normalize a single log entry into 0..n clean lines
 */
export const normalizeLogEntry = (
    entry: string,
    { keepTimestamps = true }: { keepTimestamps?: boolean } = {},
): string[] => {
    // unwrap JSON-quoted or escaped
    const unwrapped = tryUnwrapJSONString(entry);

    // split into lines, trim trailing spaces, drop empties
    let lines = unwrapped
        .split("\n")
        .map(l => l.trimEnd())
        .filter(l => l.trim() !== "");

    if (!keepTimestamps) {
        lines = lines.map(l => l.replace(/^\d{1,2}:\d{2}:\d{2}\s?(AM|PM)\s?/, ""));
    }

    return lines;
};

export const copyToClipboard = async (text: string) => {
    // Modern approach - works in most browsers with user interaction
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn("Clipboard API failed:", err);
        }
    }
    // Fallback for older browsers or insecure contexts
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.cssText = `
            position: fixed;
            left: -9999px;
            top: -9999px;
            opacity: 0;
            width: 1px;
            height: 1px;
            border: none;
            outline: none;
            padding: 0;
            margin: 0;
            overflow: hidden;
        `;
        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        try {
            // noinspection JSDeprecatedSymbols
            return document.execCommand("copy", false);
        } catch {
            throw new Error("execCommand failed");
        } finally {
            document.body.removeChild(textarea);
        }
    } catch (_) {
        return false;
    }
};

export const parseRequestId = (rawMessage: string): string | undefined => {
    // Check for type field first to confirm it's an input request
    const typePattern = /['"]?type['"]?\s*:\s*['"]?(debug_input_request|input_request)['"]?/;
    if (!typePattern.test(rawMessage)) {
        return undefined;
    }
    const requestIdPatterns = [
        // JSON style: "request_id": "value"
        /"request_id"\s*:\s*"([^"]+)"/,
        // Python dict with single quotes: 'request_id': 'value'
        /'request_id'\s*:\s*'([^']+)'/,
        // Mixed quotes: 'request_id': "value" or "request_id": 'value'
        /['"]request_id['"]?\s*:\s*['"]([^'"]+)['"]/,
        // No quotes on key: request_id: "value" or request_id: 'value'
        /request_id\s*:\s*['"]([^'"]+)['"]/,
    ];
    for (const pattern of requestIdPatterns) {
        const match = rawMessage.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return undefined;
};
