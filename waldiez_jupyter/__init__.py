# type: ignore
"""Jupyter server extension for Waldiez."""

from typing import Dict, List

from jupyter_server.serverapp import ServerApp

# pylint: disable=import-error
# pyright: reportMissingImports=false
try:
    from ._version import __version__  # noqa
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode:
    # https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings

    warnings.warn("Importing 'waldiez_jupyter' outside a proper installation.")
    __version__ = "dev"


from .handlers import setup_handlers


def _jupyter_labextension_paths() -> List[Dict[str, str]]:
    return [{"src": "labextension", "dest": "@waldiez/jupyter"}]


def _jupyter_server_extension_points() -> List[Dict[str, str]]:
    return [{"module": "waldiez_jupyter"}]


def _load_jupyter_server_extension(server_app: ServerApp) -> None:
    """Register the API handler to receive HTTP requests from the frontend.

    Parameters
    ----------
    server_app: ServerApp
        JupyterLab application instance
    """
    setup_handlers(server_app.web_app)
    name = "@waldiez/jupyter"
    server_app.log.info(f"Registered {name} server extension")
