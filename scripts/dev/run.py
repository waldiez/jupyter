"""Start/stop dev mode.

--react (frontend)
if both, we subprocess two calls
"""

import multiprocessing
import os
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

VENV_DIR = ROOT_DIR / ".venv"
EXE_ = ".exe" if sys.platform == "win32" else ""
BIN_DIR = VENV_DIR / "Scripts" if sys.platform == "win32" else VENV_DIR / "bin"
JLPM_COMMAND = str(BIN_DIR / f"jlpm{EXE_}")
JUPYTER_COMMAND = str(BIN_DIR / f"jupyter{EXE_}")
PYTHON_COMMAND = str(BIN_DIR / f"python{EXE_}")


def activate_venv() -> None:
    """Activate the virtual environment."""
    if not BIN_DIR.is_dir() or not (BIN_DIR / f"python{EXE_}").is_file():
        return
    # pylint: disable=inconsistent-quotes
    os.environ["PATH"] = f"{BIN_DIR}{os.pathsep}{os.environ['PATH']}"

    if sys.platform == "win32":
        os.environ["VIRTUAL_ENV"] = str(VENV_DIR)
        os.environ["PROMPT"] = f"({VENV_DIR.name}) $P$G"


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


def _start_jlpm() -> None:
    try:
        # pylint: disable=subprocess-run-check, line-too-long
        subprocess.run([JLPM_COMMAND, "run", "watch"], cwd=ROOT_DIR, check=True)  # nosemgrep  # nosec
    except KeyboardInterrupt:
        _stop()


def _stop_using_pid() -> None:
    """Stop the Jupyter server using the PID."""
    pid_path = ROOT_DIR / "jupyter.pid"
    if not pid_path.exists():
        return
    pid = None
    with open(pid_path, "r", encoding="utf-8") as f:
        try:
            pid = int(f.read())
        except BaseException as e:  # pylint: disable=broad-except
            print(f"Error reading pid: {e}")
    if pid is None:
        return
    try:
        os.kill(pid, 15)
    except BaseException:  # pylint: disable=broad-except
        pass
    finally:
        pid_path.unlink()


def _stop_using_tasklist() -> None:
    """Stop the Jupyter server using tasklist."""
    cmd = 'tasklist /fi "imagename eq jupyter-lab.exe" /fo csv /nh'  # noqa
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
    except BaseException:  # pylint: disable=broad-except
        return
    try:
        os.kill(pid, 15)
    except BaseException:  # pylint: disable=broad-except
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
        cmd = f"ps aux | grep -v grep | grep {kwd} | awk '{{print $2}}' | xargs kill -9 > /dev/null 2>&1 || true"
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
    _start_jlpm()


if __name__ == "__main__":
    activate_venv()
    main()
