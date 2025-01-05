# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Handle file uploads."""

import json
import os
from pathlib import Path

from jupyter_server.base.handlers import APIHandler
from pathvalidate import sanitize_filename
from tornado.web import HTTPError

ALLOWED_EXTENSIONS = {
    ".txt",
    ".pdf",
    ".doc",
    ".docx",
    ".rtf",
    ".xlsx",
    ".xls",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".md",
    ".odt",
}


class UploadHandler(APIHandler):
    """Upload handler to handle file uploads."""

    def data_received(self, chunk: bytes) -> None:
        """Just to make the linter happy.

        avoid: Pylint W0223:abstract-method

        Parameters
        ----------
        chunk : bytes
            The chunk of data received.
        """
        super().data_received(chunk)  # pragma: no cover

    async def post(self) -> None:
        """Handle a POST request.

        Raises
        ------
        HTTPError
            If the request data is invalid.

        The request should contain the file to upload.

        Example URL:
        /waldiez/upload
        """
        file_info = self.request.files.get("file", None)
        if not file_info:
            raise HTTPError(400, reason="No file in request")
        file = file_info[0]
        # make sure the filename is safe (no extra dots, slashes, etc.)
        filename = sanitize_filename(file["filename"])
        # make sure the file extension is allowed
        if not is_allowed_extension(filename):
            raise HTTPError(400, reason="File extension not allowed")
        # save the file
        file_path = self._get_file_path(filename)
        with open(file_path, "wb") as file_obj:
            file_obj.write(file["body"])
        self.finish(json.dumps({"path": str(file_path)}))

    def _get_file_path(self, file_name: str) -> Path:
        """Get the actual path of the file.

        Parameters
        ----------
        file_name : str
            The filename to save.

        Returns
        -------
        str
            The actual path of the file (where it will be saved).
        """
        joined = os.path.join(self.contents_manager.root_dir, file_name)
        return Path(os.path.abspath(joined))


def is_allowed_extension(filename: str) -> bool:
    """Check if the file extension is allowed.

    Parameters
    ----------
    filename : str
        The filename to check.

    Returns
    -------
    bool
        True if the extension is allowed, False otherwise.
    """
    return any(filename.endswith(extension) for extension in ALLOWED_EXTENSIONS)
