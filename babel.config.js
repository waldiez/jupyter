/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
const babelConfig = require("@jupyterlab/testutils/lib/babel.config");
module.exports = {
    env: {
        test: {
            plugins: ["@babel/plugin-transform-modules-commonjs"],
        },
    },
};
