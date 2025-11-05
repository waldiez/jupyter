/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
const jestJupyterLab = require("@jupyterlab/testutils/lib/jest-config");

// noinspection JSValidateTypes
/** @type {import('ts-jest').JestConfigWithTsJest} **/

const baseConfig = jestJupyterLab(__dirname);
const threshold = 80;

module.exports = {
    ...baseConfig,
    globals: {
        NODE_ENV: "test",
    },
    testEnvironment: "jest-fixed-jsdom",
    testRegex: "src/.*/.*.spec.ts[x]?$",
    preset: "ts-jest",
    automock: false,
    collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts", "!src/**/.ipynb_checkpoints/*"],
    bail: 1,
    coverageThreshold: {
        global: {
            branches: threshold,
            functions: threshold,
            lines: threshold,
            statements: threshold,
        },
    },
    coverageDirectory: "coverage/js",
    coverageReporters: ["text", "text-summary", "lcov"],
    transform: {
        "^.+\\.(ts|tsx)$": [
            "ts-jest",
            {
                tsconfig: "<rootDir>/tsconfig.json",
            },
        ],
        "^.+\\.(js|jsx|mjs)$": [
            "babel-jest",
            {
                presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"],
                plugins: [
                    "@babel/plugin-transform-modules-commonjs",
                    "@babel/plugin-proposal-class-properties",
                    "@babel/plugin-transform-private-methods",
                ],
            },
        ],
    },
    transformIgnorePatterns: [
        "<rootDir>/node_modules/.*\\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$",
        "<rootDir>/.venv/",
        "<rootDir>/jest.setup.js",
        // `<rootDir>/node_modules/(?!${esModules}).+`,
    ],
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
    testPathIgnorePatterns: ["dist"],
    modulePaths: ["<rootDir>/src", "<rootDir>/node_modules"],
    roots: ["src"],
    moduleNameMapper: {
        yjs: "<rootDir>/node_modules/yjs",
        "\\.(css|less|scss|sass)$": "identity-obj-proxy",
        "\\.(png|jpg|jpeg|gif|woff|woff2|ttf|eot)$": "<rootDir>/jest.fileMock.js",
        "\\.svg$": "<rootDir>/jest.svgMock.js",
    },
};
