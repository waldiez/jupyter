/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiTests = path.resolve(__dirname, "..", "ui-tests");
const patchDir = path.resolve(__dirname, "..", "patch");
const nodeModules = path.resolve(__dirname, "..", "node_modules");

if (fs.existsSync(uiTests)) {
    execSync(`cd ${uiTests} && yarn install`, { stdio: "inherit" });
} else {
    console.error("ui-tests directory does not exist. Skipping yarn install.");
}
if (fs.existsSync(patchDir)) {
    const src = path.resolve(patchDir, "entities");
    const dest = path.resolve(nodeModules, "@types", "entities");
    fs.ensureDirSync(path.resolve(nodeModules, "@types"));
    fs.copySync(src, dest, { overwrite: true });
} else {
    console.error("patch directory does not exist. Skipping copy.");
}
