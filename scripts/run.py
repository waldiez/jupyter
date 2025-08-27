# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Start/stop dev mode.
--react (frontend)
if both, we subprocess two calls
"""

import multiprocessing
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

VENV_DIR = ROOT_DIR / ".venv"
EXE_ = ".exe" if sys.platform == "win32" else ""
BIN_DIR = VENV_DIR / "Scripts" if sys.platform == "win32" else VENV_DIR / "bin"
YARN_COMMAND = shutil.which("yarn")
if not YARN_COMMAND:
    print("Yarn not found, please install it")
    sys.exit(1)
JUPYTER_COMMAND = str(BIN_DIR / f"jupyter{EXE_}")
PYTHON_COMMAND = str(BIN_DIR / f"python{EXE_}")


def _do_start_jupyter() -> None:
    os.environ["PYTHONUNBUFFERED"] = "1"
    cmd = [JUPYTER_COMMAND, "lab", "-y", "--no-browser", "--autoreload"]
    if (ROOT_DIR / "examples").exists():
        cmd += ["--notebook-dir", "examples"]
    subprocess.run(  # nosemgrep  # nosec
        cmd,
        cwd=ROOT_DIR,
        check=True,
        env=os.environ,
    )


def _start_jupyter() -> None:
    """Start the Jupyter server."""
    pid_path = ROOT_DIR / "jupyter.pid"
    if pid_path.exists():
        print("Jupyter server already running?, or stale pid file")
        return
    multiprocessing.set_start_method("spawn")
    p = multiprocessing.Process(target=_do_start_jupyter, daemon=True)
    p.start()
    pid = p.pid
    with open(ROOT_DIR / "jupyter.pid", "w", encoding="utf-8") as f:
        f.write(str(pid))


def _start_yarn() -> None:
    try:
        # pylint: disable=subprocess-run-check, line-too-long
        subprocess.run(  # nosemgrep  # nosec
            [str(YARN_COMMAND), "run", "watch"], cwd=ROOT_DIR, check=True
        )
    except KeyboardInterrupt:
        _stop()


# pylint: disable=broad-exception-caught
# noinspection PyBroadException
def _stop_using_pid() -> None:
    """Stop the Jupyter server using the PID."""
    pid_path = ROOT_DIR / "jupyter.pid"
    if not pid_path.exists():
        return
    pid = None
    with open(pid_path, "r", encoding="utf-8") as f:
        try:
            pid = int(f.read())
        except BaseException as e:
            print(f"Error reading pid: {e}")
    if pid is None:
        return
    try:
        os.kill(pid, 15)
    except BaseException:
        pass
    finally:
        pid_path.unlink()


# pylint: disable=broad-exception-caught
# noinspection PyBroadException
def _stop_using_tasklist() -> None:
    """Stop the Jupyter server using tasklist."""
    cmd = 'tasklist /fi "imagename eq jupyter-lab.exe" /fo csv /nh'  # noqa
    # noinspection SubprocessShellMode
    result = subprocess.run(  # nosemgrep  # nosec
        cmd,
        shell=True,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if not result.stdout:
        return
    try:
        pid = int(result.stdout.decode().split(",")[1].strip('"'))
    except BaseException:
        return
    try:
        os.kill(pid, 15)
    except BaseException:
        pass


def _stop() -> None:
    """Stop the Jupyter server."""
    _stop_using_pid()
    # in case no pid file was found
    if sys.platform == "win32":
        _stop_using_tasklist()
        return
    for kwd in ("ipykernel_launcher", "jupyter-lab"):
        # pylint: disable=line-too-long
        cmd = f"ps aux | grep -v grep | grep {kwd} | awk '{{print $2}}' | xargs kill -9 > /dev/null 2>&1 || true"  # noqa E501
        # noinspection SubprocessShellMode
        subprocess.run(
            cmd,
            shell=True,
            check=True,
        )  # nosemgrep  # nosec


def main() -> None:
    """Run the main script."""
    if "--stop" in sys.argv:
        _stop()
        return
    _start_jupyter()
    _start_yarn()


if __name__ == "__main__":
    main()
