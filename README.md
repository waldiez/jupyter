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
  -p 8888:8888 \
  -v ${PWD}/notebooks:/home/waldiez/notebooks \
  waldiez/jupyter:latest

# with selinux and/or podman, you might get permission errors, so you can try:
$CONTAINER_COMMAND run \
  --rm \
  -it \
  -p 10000:8888 \
  -v ${PWD}/notebooks:/home/waldiez/notebooks \
  --userns=keep-id \
  --security-opt label=disable waldiez/jupyter:latest
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

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://scholar.google.com/citations?user=JmW9DwkAAAAJ"><img src="https://avatars.githubusercontent.com/u/29335277?v=4?s=100" width="100px;" alt="Panagiotis Kasnesis"/><br /><sub><b>Panagiotis Kasnesis</b></sub></a><br /><a href="#projectManagement-ounospanas" title="Project Management">📆</a> <a href="#research-ounospanas" title="Research">🔬</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/lazToum"><img src="https://avatars.githubusercontent.com/u/4764837?v=4?s=100" width="100px;" alt="Lazaros Toumanidis"/><br /><sub><b>Lazaros Toumanidis</b></sub></a><br /><a href="https://github.com/waldiez/jupyter/commits?author=lazToum" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://humancentered.gr/"><img src="https://avatars.githubusercontent.com/u/3456066?v=4?s=100" width="100px;" alt="Stella Ioannidou"/><br /><sub><b>Stella Ioannidou</b></sub></a><br /><a href="#promotion-siioannidou" title="Promotion">📣</a> <a href="#design-siioannidou" title="Design">🎨</a></td>
  </tbody>
  <tfoot>
    <tr>
      <td align="center" size="13px" colspan="7">
        <img src="https://raw.githubusercontent.com/all-contributors/all-contributors-cli/1b8533af435da9854653492b1327a23a4dbd0a10/assets/logo-small.svg">
          <a href="https://all-contributors.js.org/docs/en/bot/usage">Add your contributions</a>
        </img>
      </td>
    </tr>
  </tfoot>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## License

This project is licensed under the [Apache License, Version 2.0 (Apache-2.0)](https://github.com/waldiez/jupyter/blob/main/LICENSE).
