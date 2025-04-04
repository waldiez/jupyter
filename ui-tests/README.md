# Integration Testing

This folder contains the integration tests of the extension.

They are defined using [Playwright](https://playwright.dev/docs/intro) test runner
and [Galata](https://github.com/jupyterlab/jupyterlab/tree/main/galata) helper.

The Playwright configuration is defined in [playwright.config.js](./playwright.config.js).

The JupyterLab server configuration to use for the integration test is defined
in [jupyter_server_test_config.py](./jupyter_server_test_config.py).

The default configuration will produce video for failing tests and an HTML report.

> There is a UI mode that you may like; see [that video](https://www.youtube.com/watch?v=jF0yA-JLQW0).

## Run the tests

> All commands are assumed to be executed from the root directory

To run the tests, you need to:

1. Compile the extension:

```shell
yarn install
yarn build
```

> Check the extension is installed in JupyterLab.

<!-- markdownlint-disable MD029 -->
2. Install test dependencies (needed only once):

```shell
cd ./ui-tests
yarn install
yarn playwright install
cd ..
```

3. Execute the [Playwright](https://playwright.dev/docs/intro) tests:

```shell
cd ./ui-tests
yarn playwright test
```

Test results will be shown in the terminal. In case of any test failures, the test report
will be opened in your browser at the end of the tests execution; see
[Playwright documentation](https://playwright.dev/docs/test-reporters#html-reporter)
for configuring that behavior.

## Update the tests snapshots

> All commands are assumed to be executed from the root directory

If you are comparing snapshots to validate your tests, you may need to update
the reference snapshots stored in the repository. To do that, you need to:

1. Compile the extension:

```shell
yarn install
yarn build
```

> Check the extension is installed in JupyterLab.

2. Install test dependencies (needed only once):

```shell
cd ./ui-tests
yarn install
yarn playwright install
cd ..
```

3. Execute the [Playwright](https://playwright.dev/docs/intro) command:

```shell
cd ./ui-tests
yarn playwright test -u
```

> Some discrepancy may occurs between the snapshots generated on your computer and
> the one generated on the CI. To ease updating the snapshots on a PR, you can
> type `please update playwright snapshots` to trigger the update by a bot on the CI.
> Once the bot has computed new snapshots, it will commit them to the PR branch.

## Create tests

> All commands are assumed to be executed from the root directory

To create tests, the easiest way is to use the code generator tool of playwright:

1. Compile the extension:

```shell
yarn install
yarn build
```

> Check the extension is installed in JupyterLab.

2. Install test dependencies (needed only once):

```shell
cd ./ui-tests
yarn install
yarn playwright install
cd ..
```

3. Start the server:

```shell
cd ./ui-tests
yarn start
```

4. Execute the [Playwright code generator](https://playwright.dev/docs/codegen) in **another terminal**:

```shell
cd ./ui-tests
yarn playwright codegen localhost:8888
```

## Debug tests

> All commands are assumed to be executed from the root directory

To debug tests, a good way is to use the inspector tool of playwright:

1. Compile the extension:

```shell
yarn install
yarn build:prod
```

> Check the extension is installed in JupyterLab.

2. Install test dependencies (needed only once):

```shell
cd ./ui-tests
yarn install
yarn playwright install
cd ..
```

3. Execute the Playwright tests in [debug mode](https://playwright.dev/docs/debug):

```shell
cd ./ui-tests
yarn playwright test --debug
```

## Upgrade Playwright and the browsers

To update the web browser versions, you must update the package `@playwright/test`:

```shell
cd ./ui-tests
yarn up "@playwright/test"
yarn playwright install
```
