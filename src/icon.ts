import { LabIcon } from "@jupyterlab/ui-components";

import waldiez_logo from "@waldiez/react/dist/logo.svg";

/**
 * The waldiez icon.
 * @type {LabIcon}
 * @public
 */
export const waldiezIcon: LabIcon = new LabIcon({
    name: "waldiez:icon/logo",
    svgstr: waldiez_logo,
});
