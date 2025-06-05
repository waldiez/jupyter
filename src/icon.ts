/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { LabIcon } from "@jupyterlab/ui-components";

import waldiez_logo from "@waldiez/react/dist/icon.svg";

/**
 * The waldiez icon.
 * @type {LabIcon}
 * @public
 */
export const waldiezIcon: LabIcon = new LabIcon({
    name: "waldiez:icon/logo",
    svgstr: waldiez_logo,
});
