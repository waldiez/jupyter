# @waldiez/jupyter

![CI Build](https://github.com/waldiez/jupyter/actions/workflows/main.yaml/badge.svg) [![Coverage Status](https://coveralls.io/repos/github/waldiez/jupyter/badge.svg)](https://coveralls.io/github/waldiez/jupyter) [![PyPI version](https://badge.fury.io/py/waldiez-jupyter.svg)](https://badge.fury.io/py/waldiez-jupyter)

A Waldiez JupyterLab extension.

![Overview](https://raw.githubusercontent.com/waldiez/jupyter/refs/heads/main/overview.webp)

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

## License

This project is licensed under the [Apache License, Version 2.0 (Apache-2.0)](https://github.com/waldiez/jupyter/blob/main/LICENSE).
