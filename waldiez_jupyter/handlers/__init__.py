"""Extension handlers for the Jupyter Server."""

from jupyter_server.serverapp import ServerWebApplication
from jupyter_server.utils import url_path_join

from .extra_static_files import ensure_extra_static_files
from .files_handler import FilesHandler
from .upload_handler import UploadHandler


def setup_handlers(web_app: ServerWebApplication) -> None:
    """Add the extension handlers to the Jupyter server web application.

    Parameters
    ----------
    web_app : ServerWebApplication
        Jupyter server web application
    """
    host_pattern = ".*$"
    static_path_or_paths = web_app.settings["static_path"]
    if isinstance(static_path_or_paths, list):
        static_path = static_path_or_paths[-1]
    else:
        static_path = static_path_or_paths
    ensure_extra_static_files(static_path)
    base_url = web_app.settings["base_url"]
    files_pattern = url_path_join(base_url, "waldiez", "files")
    upload_pattern = url_path_join(base_url, "waldiez", "upload")
    web_app.add_handlers(
        host_pattern,
        [(files_pattern, FilesHandler), (upload_pattern, UploadHandler)],
    )
