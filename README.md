# @waldiez/jupyter

![CI Build](https://github.com/waldiez/jupyter/actions/workflows/main.yaml/badge.svg) [![Coverage Status](https://coveralls.io/repos/github/waldiez/jupyter/badge.svg)](https://coveralls.io/github/waldiez/jupyter) [![PyPI version](https://badge.fury.io/py/waldiez-jupyter.svg)](https://badge.fury.io/py/waldiez-jupyter)

A Waldiez JupyterLab extension.

This extension is composed of a Python package named `waldiez-jupyter`
for the server extension and a NPM package named `@waldiez/jupyter`
for the frontend extension.

## Quick Start

Using docker:

```shell
CONTAINER_COMMAND=docker # or podman
$CONTAINER_COMMAND run \
  --rm \
  -it \
  -p 10000:8888 \
  -v ${PWD}/notebooks:/home/user/notebooks \
  ghcr.io/waldiez/jupyter:latest

# with selinux and/or podman, you might get permission errors, so you can try:
$CONTAINER_COMMAND run \
  --rm \
  -it \
  -p 10000:8888 \
  -v ${PWD}/notebooks:/home/user/notebooks \
  --userns=keep-id \
  --security-opt label=disable ghcr.io/waldiez/jupyter:latest
```

Then open your browser at `http://localhost:10000` and you should see the JupyterLab interface.

Optional environment variables for the container:

```shell
# no password or token by default
JUPYTER_PASSWORD=
JUPYTER_TOKEN=
```

## Requirements

- JupyterLab >= 4.0.0

## Install

To install the extension, execute:

```shell
## if not already, install jupyter:
# pip install jupyter
pip install waldiez-jupyter
## you can now start jupyter lab:
# jupyter lab
```

Or from the repository:

```shell
# Note: node js and yarn are required to build the extension
pip install git+https://github.com/waldiez/jupyter
```

## Uninstall

To remove the extension, execute:

```shell
pip uninstall waldiez_jupyter
```

## Troubleshoot

If you are seeing the frontend extension, but it is not working, check
that the server extension is enabled:

```shell
jupyter server extension list
```

If the server extension is installed and enabled, but you are not seeing
the frontend extension, check the frontend extension is installed:

```shell
jupyter labextension list
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```shell
# Clone the repo to your local environment
# Change directory to the waldiez_jupyter directory
# Install package in development mode
pip install -e ".[test]"
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Server extension must be manually installed in develop mode
jupyter server extension enable waldiez_jupyter
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```shell
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```shell
jupyter lab build --minimize=False
```

### Development uninstall

```shell
# Server extension must be manually disabled in develop mode
jupyter server extension disable waldiez_jupyter
pip uninstall waldiez_jupyter
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `waldiez` within that folder.

### Testing the extension

#### Server tests

This extension is using [Pytest](https://docs.pytest.org/) for Python code testing.

Install test dependencies (needed only once):

```shell
pip install -e ".[test]"
# Each time you install the Python package, you need to restore the front-end extension link
jupyter labextension develop . --overwrite
```

To execute them, run:

```shell
pytest -vv -r ap --cov waldiez_jupyter
```

#### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```shell
jlpm
jlpm test
```

#### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.

More information are provided within the [ui-tests](./ui-tests/README.md) README.

### Packaging the extension

See [RELEASE](RELEASE.md)
