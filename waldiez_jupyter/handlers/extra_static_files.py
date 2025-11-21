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
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import urllib3
from packaging import version

REGISTRY_BASE_URL = "https://registry.npmjs.org"
PACKAGE_NAME = "monaco-editor"
DETAILS_JSON = "monaco_details.json"
PINNED_VERSION: str | None = "0.55.1"

LOG = logging.getLogger(__name__)

# pylint: disable=broad-except


def ensure_extra_static_files(static_root_path: str | Path) -> None:
    """Ensure extra static files are present.

    Parameters
    ----------
    static_root_path : str | Path
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


def _get_package_details(static_root_path: Path) -> tuple[str, str, str]:
    """Get details about the target version of monaco editor.

    Parameters
    ----------
    static_root_path : Path
        The path to the static files directory.

    Returns
    -------
    tuple[str, str, str]
        The target version, download url, and SHA-1 sum.
    """
    cached_details: tuple[str, str, str] | None = _get_cached_details(
        static_root_path=static_root_path,
    )
    if cached_details:
        if not PINNED_VERSION or PINNED_VERSION == cached_details[0]:
            return cached_details
    http = urllib3.PoolManager()
    response = http.request("GET", f"{REGISTRY_BASE_URL}/{PACKAGE_NAME}")
    data = json.loads(response.data)
    target_version = data["dist-tags"]["latest"]
    if PINNED_VERSION and PINNED_VERSION in data["versions"]:
        target_version = PINNED_VERSION
    target_version_data = data["versions"][target_version]
    url = target_version_data["dist"]["tarball"]
    sha_sum = target_version_data["dist"]["shasum"]
    return target_version, url, sha_sum


def _download_monaco_editor(
    details: tuple[str, str, str],
    static_dir: str | Path,
) -> None:
    """Download and extract the monaco editor files.

    Parameters
    ----------
    details : tuple[str, str, str]
        The version, download url, and SHA-1 sum.

    static_dir : str | Path
        The path to the static files directory.
    """
    http = urllib3.PoolManager()
    version_url, version_sha_sum = details[1], details[2]
    response = http.request("GET", version_url)
    # noinspection InsecureHash
    sha_sum = hashlib.sha1(response.data, usedforsecurity=False).hexdigest()
    if sha_sum != version_sha_sum:  # pragma: no cover
        raise ValueError("SHA-1 sum mismatch.")
    os.makedirs(static_dir, exist_ok=True)
    tmp_dir = _extract_monaco_editor_files(response)
    monaco_editor_path = os.path.join(tmp_dir, "package")
    min_vs = os.path.join("min", "vs")
    src_dir = os.path.join(monaco_editor_path, min_vs)
    if not os.path.exists(src_dir):
        if os.path.exists(monaco_editor_path):
            shutil.rmtree(monaco_editor_path)
        raise FileNotFoundError("Failed to extract monaco editor files.")
    dst_dir = os.path.join(static_dir, "vs")
    if os.path.exists(dst_dir):
        shutil.rmtree(dst_dir)
    msg = f"Copying {src_dir} to {dst_dir}"
    LOG.info(msg)
    shutil.copytree(src_dir, dst_dir)
    # min-maps might not exist (e.g. in v0.53.0)
    min_maps = os.path.join(monaco_editor_path, "min-maps")
    if os.path.exists(min_maps):
        dst_dir = os.path.join(static_dir, "min-maps")
        if os.path.exists(dst_dir):
            shutil.rmtree(dst_dir)
        msg = f"Copying {min_maps} to {dst_dir}"
        LOG.info(msg)
        shutil.copytree(min_maps, dst_dir)
    shutil.rmtree(tmp_dir)


def _extract_monaco_editor_files(response: urllib3.BaseHTTPResponse) -> str:
    """Extract the monaco editor files.

    Parameters
    ----------
    response : urllib3.BaseHTTPResponse
        The response object.

    Returns
    -------
    str
        The path to the extracted files.
    """
    tmp_dir = tempfile.mkdtemp()
    with tarfile.open(fileobj=io.BytesIO(response.data)) as tar:
        if _has_filter_parameter():
            tar.extractall(path=tmp_dir, filter="data")  # nosemgrep # nosec
        else:
            tar.extractall(path=tmp_dir)  # nosemgrep # nosec
    return tmp_dir


def _remove_loader_js(static_root_path: Path) -> None:
    """Remove loader.js if it exists."""
    loader_js = static_root_path / "vs" / "loader.js"
    if loader_js.exists():
        try:
            loader_js.unlink(missing_ok=True)
        except BaseException:
            pass


def _get_cached_details(
    static_root_path: Path,
) -> tuple[str, str, str] | None:
    """Get the cached details of the monaco editor.

    Parameters
    ----------
    static_root_path : Path
        The path to the static files directory.

    Returns
    -------
    tuple[str, str, str], optional
        The target version, download url, and SHA-1 sum.
    """
    details_file = static_root_path / DETAILS_JSON
    # pylint: disable=broad-except, too-many-try-statements
    # noinspection PyBroadException
    try:
        if details_file.exists():
            with open(details_file, "r", encoding="utf-8") as file:
                data = json.load(file)
            try:
                last_check = datetime.fromisoformat(data.get("last_check", ""))
            except ValueError:  # pragma: no cover
                _remove_loader_js(static_root_path)
                return None
            local_version = data.get("version")
            url = data.get("url")
            sha_sum = data.get("sha_sum")
            if not all((local_version, url, sha_sum)):
                _remove_loader_js(static_root_path)
                return None
            if datetime.now(timezone.utc) - last_check < timedelta(days=1):
                return local_version, url, sha_sum
    except BaseException:  # pragma: no cover
        pass
    _remove_loader_js(static_root_path)
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
    if py_minor >= 12:
        return True
    py_micro = sys.version_info.micro
    if version.parse("3.10.12") <= version.parse(f"3.{py_minor}.{py_micro}"):
        return True
    if version.parse("3.11.4") <= version.parse(f"3.{py_minor}.{py_micro}"):
        return True
    return False


if __name__ == "__main__":
    print(_has_filter_parameter())
