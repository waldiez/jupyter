# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Test waldiez_jupyter.handlers.extra_static_files.*."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from waldiez_jupyter.handlers.extra_static_files import (
    DETAILS_JSON,
    ensure_extra_static_files,
)


def test_ensure_extra_static_files(tmp_path: Path) -> None:
    """Test ensure_extra_static_files.

    Parameters
    ----------
    tmp_path : Path
        The temporary path.
    """
    static_root_path = tmp_path / "static"
    static_root_path.mkdir(parents=True, exist_ok=True)
    details = {
        "version": "0.0.1",
        "url": "https://example.com",
        "sha_sum": "1234567890",
    }
    details_json = static_root_path / DETAILS_JSON
    details_json.write_text(json.dumps(details))
    ensure_extra_static_files(static_root_path)
    assert (static_root_path / "vs" / "loader.js").exists()
    assert details_json.exists()


def test_ensure_extra_static_files_no_details(tmp_path: Path) -> None:
    """Test ensure_extra_static_files.

    Parameters
    ----------
    tmp_path : Path
        The temporary path.
    """
    with patch(
        "waldiez_jupyter.handlers.extra_static_files._get_package_details",
        side_effect=Exception,
    ):
        with pytest.raises(RuntimeError):
            ensure_extra_static_files(tmp_path)


def test_ensure_extra_static_files_no_loader_js(tmp_path: Path) -> None:
    """Test ensure_extra_static_files.

    Parameters
    ----------
    tmp_path : Path
        The temporary path.
    """
    static_root_path = tmp_path / "static"
    static_root_path.mkdir(parents=True, exist_ok=True)
    details = {
        "version": "0.0.1",
        "url": "https://example.com",
        "sha_sum": "1234567890",
    }
    details_json = static_root_path / DETAILS_JSON
    details_json.write_text(json.dumps(details))
    with patch(
        "waldiez_jupyter.handlers.extra_static_files._download_monaco_editor",
        side_effect=Exception,
    ):
        with pytest.raises(RuntimeError):
            ensure_extra_static_files(static_root_path)
