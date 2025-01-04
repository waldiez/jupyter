# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Ensure extra static files (for monaco editor) are present.
We can serve these files from the Jupyter server or not.
The option is available on the plugin configuration page.
The default is to do serve them. If not, the files are served
from the default CDN that monaco loader uses.
"""

import hashlib
import io
import json
import logging
import os
import shutil
import sys
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple, Union

import urllib3
from packaging import version

REGISTRY_BASE_URL = "https://registry.npmjs.org"
PACKAGE_NAME = "monaco-editor"
DETAILS_JSON = "monaco_details.json"
LOG = logging.getLogger(__name__)

# pylint: disable=broad-except


def ensure_extra_static_files(static_root_path: Union[str, Path]) -> None:
    """Ensure extra static files are present.

    Parameters
    ----------
    static_root_path : Union[str, Path]
        The path to the static files directory

    Raises
    ------
    RuntimeError
        If the monaco editor files are not found.
    """
    if not isinstance(static_root_path, Path):
        static_root_path = Path(static_root_path)
    static_root_path.mkdir(parents=True, exist_ok=True)
    try:
        details = _get_package_details(static_root_path)
    except BaseException as error:
        LOG.error("Failed to get the latest version of monaco: %s", error)
        raise RuntimeError(
            "Failed to get the latest version of monaco."
        ) from error
    current_version, url, sha_sum = details
    loader_js = static_root_path / "vs" / "loader.js"
    if not loader_js.exists():
        LOG.info("Downloading monaco editor files...")
        try:
            _download_monaco_editor(details, static_root_path)
        except BaseException as error:
            LOG.error("Failed to download monaco editor files: %s", error)
            raise RuntimeError(
                "Failed to download monaco editor files."
            ) from error
    if not loader_js.exists():
        LOG.error("Monaco editor files not found.")
        LOG.error("Path: %s", static_root_path)
        LOG.error("Files: %s", os.listdir(static_root_path))
        raise RuntimeError("Failed to download monaco editor files.")
    with open(
        static_root_path / DETAILS_JSON,
        "w",
        encoding="utf-8",
        newline="\n",
    ) as file:
        json.dump(
            {
                "last_check": datetime.now(timezone.utc).isoformat(),
                "version": current_version,
                "url": url,
                "sha_sum": sha_sum,
            },
            file,
            indent=4,
        )
    LOG.info("Monaco editor files are up-to-date.")


def _get_package_details(static_root_path: Path) -> Tuple[str, str, str]:
    """Get details about the latest version of monaco editor.

    Parameters
    ----------
    static_root_path : Path
        The path to the static files directory.

    Returns
    -------
    Tuple[str, str, str]
        The latest version, download url, and SHA-1 sum.
    """
    cached_details = _get_cached_details(static_root_path)
    if cached_details:
        return cached_details
    http = urllib3.PoolManager()
    response = http.request("GET", f"{REGISTRY_BASE_URL}/{PACKAGE_NAME}")
    data = json.loads(response.data)
    latest_version = data["dist-tags"]["latest"]
    latest_version_data = data["versions"][latest_version]
    url = latest_version_data["dist"]["tarball"]
    sha_sum = latest_version_data["dist"]["shasum"]
    return latest_version, url, sha_sum


def _download_monaco_editor(
    details: Tuple[str, str, str],
    static_dir: Union[str, Path],
) -> None:
    """Download and extract the monaco editor files.

    Parameters
    ----------
    details : Tuple[str, str, str]
        The version, download url, and SHA-1 sum.

    static_root_path : Union[str, Path]
        The path to the static files directory.
    """
    http = urllib3.PoolManager()
    version_url, version_sha_sum = details[1], details[2]
    response = http.request("GET", version_url)
    sha_sum = hashlib.sha1(response.data, usedforsecurity=False).hexdigest()
    if sha_sum != version_sha_sum:  # pragma: no cover
        raise ValueError("SHA-1 sum mismatch.")
    os.makedirs(static_dir, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(response.data)) as tar:
        if _has_filter_parameter():
            tar.extractall(path=static_dir, filter="data")  # nosemgrep # nosec
        else:
            tar.extractall(path=static_dir)  # nosemgrep # nosec
    monaco_editor_path = os.path.join(static_dir, "package")
    for src_dir_name in (os.path.join("min", "vs"), "min-maps"):
        src_dir = os.path.join(monaco_editor_path, src_dir_name)
        if not os.path.exists(src_dir):
            if os.path.exists(monaco_editor_path):
                shutil.rmtree(monaco_editor_path)
            raise FileNotFoundError("Failed to extract monaco editor files.")
        dst_din_name = src_dir_name if src_dir_name == "min-maps" else "vs"
        dst_dir = os.path.join(static_dir, dst_din_name)
        if os.path.exists(dst_dir):
            shutil.rmtree(dst_dir)
        print(f"Moving {src_dir} to {dst_dir}")
        shutil.move(src_dir, dst_dir)
    shutil.rmtree(monaco_editor_path)


def _get_cached_details(
    static_root_path: Path,
) -> Optional[Tuple[str, str, str]]:
    """Get the cached details of the monaco editor.

    Parameters
    ----------
    static_root_path : Path
        The path to the static files directory.

    Returns
    -------
    Tuple[str, str, str]
        The latest version, download url, and SHA-1 sum.
    """
    details_file = static_root_path / DETAILS_JSON
    # pylint: disable=broad-except, too-many-try-statements
    try:
        if details_file.exists():
            with open(details_file, "r", encoding="utf-8") as file:
                data = json.load(file)
            try:
                last_check = datetime.fromisoformat(data.get("last_check", ""))
            except ValueError:  # pragma: no cover
                return None
            local_version = data.get("version")
            url = data.get("url")
            sha_sum = data.get("sha_sum")
            if not all((local_version, url, sha_sum)):
                return None
            if datetime.now(timezone.utc) - last_check < timedelta(days=1):
                return local_version, url, sha_sum
    except BaseException:  # pragma: no cover
        pass
    return None


def _has_filter_parameter() -> bool:  # pragma: no cover
    """Check if the tarfile.extractall method has the filter parameter.

    Returns
    -------
    bool
        True if the filter parameter is available, False otherwise.
    """
    # Changed in version 3.10.12: Added the filter parameter.
    # Changed in version 3.11.4: Added the filter parameter.
    # Changed in version 3.12: Added the filter parameter.
    py_minor = sys.version_info.minor
    py_micro = sys.version_info.micro
    if version.parse("3.10.12") <= version.parse(f"3.{py_minor}.{py_micro}"):
        return True
    if version.parse("3.11.4") <= version.parse(f"3.{py_minor}.{py_micro}"):
        return True
    return False
