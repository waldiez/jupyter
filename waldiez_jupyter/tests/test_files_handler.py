"""Test the handlers."""

import json
import shutil
from pathlib import Path
from typing import Any, Callable

import pytest
import tornado


async def test_get_file_no_path(jp_fetch: Callable[..., Any]) -> None:
    """Test the GET file handler without a path.
    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    """
    with pytest.raises(tornado.httpclient.HTTPClientError) as exc_info:
        await jp_fetch("waldiez", "files")
    assert exc_info.value.code == 400


async def test_get_file_not_fount(jp_fetch: Callable[..., Any]) -> None:
    """Test the GET file handler with a non-existing path.
    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    """
    with pytest.raises(tornado.httpclient.HTTPClientError) as exc_info:
        await jp_fetch("waldiez", "files", params={"path": "not_found.txt"})
    assert exc_info.value.code == 404


async def test_get_file(
    jp_fetch: Callable[..., Any],
    jp_root_dir: Path,
) -> None:
    """Test the GET file handler with a valid path.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    jp_root_dir : Path
        The Jupyter server root directory.
    """
    # first create a file in the root directory
    file_path = jp_root_dir / "example.waldiez"
    file_path.write_text("test")
    response = await jp_fetch(
        "waldiez",
        "files",
        params={"path": "example.waldiez"},
    )
    assert response.code == 200
    expected = {"path": str(file_path)}
    assert response.body == json.dumps(expected).encode("utf-8")
    file_path.unlink()


async def test_export_to_py(
    jp_fetch: Callable[..., Any],
    jp_root_dir: Path,
    data_dir: Path,
) -> None:
    """Test exporting a .waldiez file to a .py file.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    jp_root_dir : Path
        The Jupyter server root directory.
    data_dir : Path
        The data directory.
    """
    waldiez_path = data_dir / "flow.waldiez"
    shutil.copy(data_dir / "flow.waldiez", jp_root_dir / "flow.waldiez")
    response = await jp_fetch(
        "waldiez",
        "files",
        method="POST",
        body=json.dumps(
            {
                "files": [str(waldiez_path)],
                "extension": "py",
            }
        ),
    )
    assert response.code == 200
    relative_to_cwd = waldiez_path.relative_to(Path.cwd())
    expected = {"files": [str(relative_to_cwd.with_suffix(".py"))]}
    # expected = {"files": [str(waldiez_path)]}
    assert response.body == json.dumps(expected).encode("utf-8")
    assert (data_dir / "flow.py").exists()
    (data_dir / "flow.py").unlink()
    (jp_root_dir / "flow.waldiez").unlink()


async def test_export_to_ipynb(
    jp_fetch: Callable[..., Any],
    jp_root_dir: Path,
    data_dir: Path,
) -> None:
    """Test exporting a .waldiez file to a .ipynb file.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    jp_root_dir : Path
        The Jupyter server root directory.
    data_dir : Path
        The data directory.
    """
    waldiez_path = data_dir / "flow.waldiez"
    shutil.copy(data_dir / "flow.waldiez", jp_root_dir / "flow.waldiez")
    response = await jp_fetch(
        "waldiez",
        "files",
        method="POST",
        body=json.dumps(
            {
                "files": [str(waldiez_path)],
                "extension": "ipynb",
            }
        ),
    )
    assert response.code == 200
    relative_to_cwd = waldiez_path.relative_to(Path.cwd())
    expected = {"files": [str(relative_to_cwd.with_suffix(".ipynb"))]}
    # expected = {"files": [str(waldiez_path)]}
    assert response.body == json.dumps(expected).encode("utf-8")
    assert (data_dir / "flow.ipynb").exists()
    (data_dir / "flow.ipynb").unlink()
    (jp_root_dir / "flow.waldiez").unlink()


async def test_export_to_invalid_extension(
    jp_fetch: Callable[..., Any],
    jp_root_dir: Path,
    data_dir: Path,
) -> None:
    """Test exporting a .waldiez file with an invalid extension.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    jp_root_dir : Path
        The Jupyter server root directory.
    data_dir : Path
        The data directory.
    """
    waldiez_path = data_dir / "flow.waldiez"
    shutil.copy(data_dir / "flow.waldiez", jp_root_dir / "flow.waldiez")
    with pytest.raises(tornado.httpclient.HTTPClientError) as exc_info:
        await jp_fetch(
            "waldiez",
            "files",
            method="POST",
            body=json.dumps(
                {
                    "files": [str(waldiez_path)],
                    "extension": "invalid",
                }
            ),
        )
    assert exc_info.value.code == 400
    assert exc_info.value.response
    assert "Invalid extension" in exc_info.value.response.reason
    (jp_root_dir / "flow.waldiez").unlink()


async def test_export_from_invalid_extension(
    jp_fetch: Callable[..., Any],
    jp_root_dir: Path,
    data_dir: Path,
) -> None:
    """Test exporting a file with an invalid extension.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    jp_root_dir : Path
        The Jupyter server root directory.
    data_dir : Path
        The data directory.
    """
    waldiez_path = data_dir / "flow.invalid"
    shutil.copy(data_dir / "flow.waldiez", jp_root_dir / "flow.invalid")
    with pytest.raises(tornado.httpclient.HTTPClientError) as exc_info:
        await jp_fetch(
            "waldiez",
            "files",
            method="POST",
            body=json.dumps(
                {
                    "files": [str(waldiez_path)],
                    "extension": "py",
                }
            ),
        )
    assert exc_info.value.code == 400
