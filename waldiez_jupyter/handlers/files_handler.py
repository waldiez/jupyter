# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Handle requests to handle .waldiez files.
GET:
    Get the actual path of a .waldiez file:
    On the frontend, the path is relative to server's setting notebook_dir.
    We need to get the actual path of the file on the server.

POST:
    Export the .waldiez files to the specified extension.
    The request should contain the list of files to export and the
        target extension to export to (either "py" or "ipynb").
    The response will contain the list of files that were exported.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Awaitable

from jupyter_server.base.handlers import APIHandler
from tornado.web import HTTPError, authenticated
from waldiez import WaldiezExporter

# pylint: disable=broad-exception-caught


class FilesHandler(APIHandler):
    """Files handler to get or export .waldiez files."""

    @authenticated
    def data_received(self, chunk: bytes) -> Awaitable[None] | None:
        """Just to make the linter happy.

        avoid: Pylint W0223:abstract-method

        Parameters
        ----------
        chunk : bytes
            The chunk of data received.

        Returns
        -------
        Awaitable[None] | None
            The data handling coroutine.
        """
        return super().data_received(chunk)  # pragma: no cover

    @authenticated
    async def get(self) -> None:
        """Handle a GET request.

        Raises
        ------
        HTTPError
            If the request data is invalid.

        Get the actual path of a .waldiez file.
        The request should contain the path of a file.

        Example URL:
        /waldiez/files?path=relative/to/example.waldiez
        /waldiez/files?view=path/to/an/image.png
        """
        if not self.request.arguments:
            raise HTTPError(400, reason="No args in request")
        view_arg = self.get_query_argument("view", None)
        if view_arg:
            self._send_image(view_arg)
            return
        path_arg = self.get_query_argument("path", None)
        if not path_arg:
            raise HTTPError(400, reason="No path in request")
        try:
            file_path = self._get_file_path(path_arg)
        except FileNotFoundError as error:
            raise HTTPError(404, reason=str(error)) from error
        self.finish(json.dumps({"path": str(file_path)}))

    @authenticated
    async def post(self) -> None:
        """Handle a POST request.

        Raises
        ------
        HTTPError
            If the request data is invalid.

        The request should contain the list of files to export and the
        target extension to export to (either "py" or "ipynb").

        Example JSON body:
        {
            "files": ["file1.waldiez", "file2.waldiez"],
            "extension": "py"
        }
        """
        try:
            files, target_extension = self._gather_post_data()
        except HTTPError as error:
            raise error
        if not files:
            raise HTTPError(400, reason="No valid files in the request")
        results = _handle_export(files, target_extension)
        self.log.info("Exported: %s", results)
        self.finish(json.dumps({"files": results}))

    def _send_image(self, file_path: str) -> None:
        """Send an image file.

        Parameters
        ----------
        file_path : str
            The path to the image file.
        """
        try:
            actual_file_path = self._get_file_path(file_path)
        except FileNotFoundError as error:
            raise HTTPError(404, reason=str(error)) from error
        with open(actual_file_path, "rb") as image_file:
            self.set_header("Content-Type", "image/png")
            self.write(image_file.read())  # pyright: ignore
            self.flush()
        self.log.info("Sent image: %s", file_path)

    def _gather_post_data(self) -> tuple[list[str], str]:
        """Gather the data from the POST request.

        Returns
        -------
        tuple[list[str], str]
            The list of files and the target extension.

        Raises
        ------
        ValueError
            If the request data is invalid
        """
        input_data = self.get_json_body()
        if not input_data:
            raise HTTPError(400, reason="No data in request")
        files: Any = input_data.get("files", [])
        target_extension = input_data.get("extension", "")
        if target_extension not in ("py", "ipynb"):
            raise HTTPError(400, reason="Invalid extension")
        if not isinstance(files, list) or not files:
            raise HTTPError(400, reason="No files in request")
        files_list: list[str] = []
        for file in files:  # pyright: ignore
            if isinstance(file, str):
                files_list.append(file)
        try:
            return self._get_file_paths(files_list), target_extension
        except BaseException as error:
            raise HTTPError(400, reason="Error getting file paths") from error

    def _get_file_path(self, file: str) -> Path:
        """Get the actual path of the file.

        Parameters
        ----------
        file : str
            The file path.

        Returns
        -------
        str
            The actual path of the file.

        Raises
        ------
        FileNotFoundError
            If the file is not found.
        """
        if os.path.exists(file) and os.path.isfile(file):
            return Path(os.path.abspath(file))
        joined = os.path.join(self.contents_manager.root_dir, file)
        self.log.error("Joined: %s", joined)
        if os.path.exists(joined) and os.path.isfile(joined):
            return Path(os.path.abspath(joined))
        raise FileNotFoundError(f"File not found: {file}")

    def _get_file_paths(self, files: list[str]) -> list[str]:
        """Get the actual paths of the files.

        Parameters
        ----------
        files : list[str]
            The list of files.
        Returns
        -------
        list[str]
            The list of actual paths of the files.
        """
        file_paths: list[str] = []
        for file in files:
            if not file.endswith(".waldiez"):
                continue
            try:
                actual_file_path = self._get_file_path(file)
            except BaseException as error:
                self.log.error("Error getting file path: %s", error)
                continue
            file_paths.append(str(actual_file_path))
        return file_paths


def _relative_to_cwd(file_path: Path) -> str:
    """Get the relative path to the current working directory.

    Parameters
    ----------
    file_path : Path
        The path to the file.

    Returns
    -------
    str
        The relative path to the current working directory.
    """
    file_path_str = str(file_path).replace(str(Path.cwd().resolve()), "")
    if file_path_str.startswith(os.path.sep):
        file_path_str = file_path_str[len(os.path.sep) :]
    return file_path_str


def _handle_export(files: list[str], target_extension: str) -> list[str]:
    """Handle the export.

    Parameters
    ----------
    files : list[str]
        The list of files to export.
    target_extension : str
        The target extension to export to.

    Returns
    -------
    list[str]
        The list of files that were exported.
    """
    file_paths: list[str] = []
    for file in files:
        file_path = Path(file).resolve()
        try:
            exporter = WaldiezExporter.load(file_path)
        except BaseException as error:  # pragma: no cover
            logging.debug("Error loading file: %s", error)
            continue
        if target_extension == "py":
            file_path = file_path.with_suffix(".py")
            try:
                exporter.export(file_path, force=True)
            except BaseException as error:  # pragma: no cover
                logging.debug("Error exporting to .py: %s", error)
                continue
            to_cwd = _relative_to_cwd(file_path)
            file_paths.append(to_cwd)
        elif target_extension == "ipynb":
            file_path = file_path.with_suffix(".ipynb")
            try:
                exporter.export(file_path, force=True)
            except BaseException as error:  # pragma: no cover
                logging.debug("Error exporting to .ipynb: %s", error)
                continue
            exporter.export(file_path, force=True)
            to_cwd = _relative_to_cwd(file_path)
            file_paths.append(to_cwd)
    return file_paths
