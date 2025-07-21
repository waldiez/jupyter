import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import headers from "eslint-plugin-headers";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import eslintTs from "typescript-eslint";

// export default eslintTs.config({
const defaultConfig = eslintTs.config({
    extends: [eslint.configs.recommended, ...eslintTs.configs.recommended, eslintPluginPrettierRecommended],
    files: ["**/*.{ts,tsx}"],
    plugins: {
        "@stylistic": stylistic,
        headers,
    },
    rules: {
        "prettier/prettier": [
            "error",
            {
                tabWidth: 4,
                printWidth: 110,
                arrowParens: "avoid",
                bracketSpacing: true,
                singleQuote: false,
                trailingComma: "all",
                endOfLine: "lf",
            },
        ],
        "@typescript-eslint/naming-convention": [
            "error",
            {
                selector: "interface",
                format: ["PascalCase"],
                custom: {
                    regex: "^I[A-Z]",
                    match: true,
                },
            },
        ],
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
            "error",
            {
                args: "all",
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_",
            },
        ],
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-unused-expressions": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@stylistic/no-explicit-any": "off",
        "@stylistic/no-trailing-spaces": "off",
        "@stylistic/padded-blocks": "off",
        "@stylistic/function-paren-newline": "off",
        "@stylistic/no-use-before-define": "off",
        "@stylistic/quotes": [
            "error",
            "double",
            {
                avoidEscape: true,
                allowTemplateLiterals: "never",
            },
        ],
        curly: ["error", "all"],
        eqeqeq: "error",
        "prefer-arrow-callback": "error",
        "headers/header-format": [
            "error",
            {
                source: "string",
                content:
                    "SPDX-License-Identifier: {spdxIdentifier}\nCopyright {startYear} - {currentYear} {owner}",
                variables: {
                    spdxIdentifier: "Apache-2.0",
                    startYear: "2024",
                    currentYear: `${new Date().getFullYear()}`,
                    owner: "Waldiez & contributors",
                },
            },
        ],
    },
});

export default [
    {
        ignores: ["node_modules", "dist", "lib", ".local", "**/.venv/**", "**/*.js", "patch"],
    },
    ...defaultConfig,
    // overrides
    ...defaultConfig.map(config => ({
        ...config,
        files: ["*spec.ts", "*spec.tsx"],
        plugins: ["jest"],
        extends: ["plugin:jest/recommended"],
        rules: {
            ...config.rules,
            "jest/expect-expect": "off",
        },
    })),
];
