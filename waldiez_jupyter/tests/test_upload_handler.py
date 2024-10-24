"""Tests for the upload handler."""

import json
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

import pytest
import tornado


async def test_valid_file_upload(
    jp_fetch: Callable[..., Any],
    jp_root_dir: Path,
    data_dir: Path,
) -> None:
    """Test a valid file upload.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    jp_root_dir : Path
        The Jupyter server root directory.
    data_dir : Path
        The data directory.
    """
    file_path = data_dir / "dummy.txt"
    boundary = uuid4().hex
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    filename = file_path.name
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; '
        f'filename="{filename}"\r\n'
        "Content-Type: text/plain\r\n\r\n"
        f"{file_path.read_text()}\r\n"
        f"--{boundary}--\r\n"
    )
    response = await jp_fetch(
        "waldiez",
        "upload",
        method="POST",
        headers=headers,
        body=body,
    )
    assert response.code == 200
    response_data = json.loads(response.body.decode("utf-8"))
    assert "path" in response_data
    destination = jp_root_dir / file_path.name
    assert response_data["path"] == str(destination)
    assert destination.exists()
    destination.unlink()


async def test_no_file_upload(jp_fetch: Callable[..., Any]) -> None:
    """Test an upload request without a file.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    """
    with pytest.raises(tornado.httpclient.HTTPClientError) as exc_info:
        await jp_fetch("waldiez", "upload", method="POST", body="")
    assert exc_info.value.code == 400


async def test_invalid_file_upload(
    jp_fetch: Callable[..., Any],
    data_dir: Path,
) -> None:
    """Test an invalid file upload.

    Parameters
    ----------
    jp_fetch : Callable[..., Any]
        The Jupyter server fetch function.
    data_dir : Path
        The data directory.
    """
    image = data_dir / "blank.png"
    boundary = uuid4().hex
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    image_data = image.read_bytes()
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; '
        'filename="blank.png"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode("utf-8")
    body += image_data
    body += f"\r\n--{boundary}--\r\n".encode("utf-8")
    with pytest.raises(tornado.httpclient.HTTPClientError) as exc_info:
        await jp_fetch(
            "waldiez",
            "upload",
            method="POST",
            headers=headers,
            body=body,
        )
    assert exc_info.value.code == 400
    assert exc_info.value.response
    assert "File extension not allowed" in exc_info.value.response.reason
