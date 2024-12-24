"""Pytest configuration file for the Waldiez Jupyter extension."""

import json
import os
from pathlib import Path
from typing import Any, Dict, Generator, List

import pytest
from filelock import FileLock
from jupyter_server import DEFAULT_STATIC_FILES_PATH

os.environ["JUPYTER_PLATFORM_DIRS"] = "1"
os.environ["JUPYTER_IS_TESTING"] = "1"

pytest_plugins = ("pytest_jupyter.jupyter_server",)

# pylint: disable=unused-argument,redefined-outer-name


@pytest.fixture
def jp_server_config(jp_server_config: Dict[str, Any]) -> Dict[str, Any]:
    """Add the extension to the server configuration.

    Parameters
    ----------
    jp_server_config : Dict[str, Any]
        The Jupyter server configuration.
    Returns
    -------
    Dict[str, Any]
        The updated server configuration.
    """
    return {"ServerApp": {"jpserver_extensions": {"waldiez_jupyter": True}}}


def _load_worker_list(fn: Path) -> List[str]:
    """Read the worker id list from a file."""
    return json.loads(fn.read_text())["workers"]


def _write_worker_list(fn: Path, workers: List[str]) -> None:
    """Write the worker id list to a file."""
    fn.write_text(json.dumps({"workers": workers}))


def _remove_monaco_latest_version() -> None:
    """Remove the monaco latest version file."""
    # remove STATIC_FILES_PATH/monaco_latest_version if it exists
    # to force/check for a new download
    static_path = Path(DEFAULT_STATIC_FILES_PATH)
    monaco_latest_version = static_path / "monaco_latest_version"
    if monaco_latest_version.exists():
        monaco_latest_version.unlink(missing_ok=True)


def _before(worker_id: str) -> None:
    """Run before all tests."""
    if worker_id == "master":
        # not executing with multiple workers
        _remove_monaco_latest_version()
        return
    # credits:
    # https://github.com/pytest-dev/pytest-xdist/issues/783#issuecomment-1793593178
    lock_file = Path(DEFAULT_STATIC_FILES_PATH) / "workers.json.lock"
    worker_list_file = Path(DEFAULT_STATIC_FILES_PATH) / "workers.json"
    with FileLock(str(lock_file)):
        is_first_worker = not worker_list_file.is_file()
        if worker_list_file.is_file():
            workers = _load_worker_list(worker_list_file)
        else:
            workers = []
            is_first_worker = True
        workers.append(worker_id)
        _write_worker_list(worker_list_file, workers)
        if is_first_worker:
            _remove_monaco_latest_version()


def _after() -> None:
    """Run after all tests."""


# pylint: disable=unused-argument
@pytest.fixture(scope="session", autouse=True)
def before_and_after_tests(
    request: Any, tmp_path_factory: pytest.TempPathFactory, worker_id: str
) -> Generator[None, None, None]:
    """Fixture to run before and after all tests.

    Parameters
    ----------
    request : Any
        The request object.
    tmp_path_factory : pytest.TempPathFactory
        The temporary path factory.
    worker_id : str
        The worker ID.

    Yields
    ------
    Generator[None, None, None]
        The generator to run the tests.
    """
    _before(worker_id)
    try:
        yield
    finally:
        _after()


@pytest.fixture
def data_dir() -> Path:
    """Return the tests data directory.

    Returns
    -------
    Path
        The tests data directory.
    """
    here = Path(__file__).parent
    return here / "waldiez_jupyter" / "tests" / "data"
