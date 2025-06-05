const jestJupyterLab = require("@jupyterlab/testutils/lib/jest-config");

/** @type {import('ts-jest').JestConfigWithTsJest} **/

const baseConfig = jestJupyterLab(__dirname);

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
        "<rootDir>/jest.setup.ts",
        // `<rootDir>/node_modules/(?!${esModules}).+`,
    ],
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
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
