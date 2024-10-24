"""Initialize the development environment."""

import os
import shutil
import subprocess  # nosemgrep # nosec
import sys
from pathlib import Path
from typing import List, Optional, Union

ROOT_DIR = Path(__file__).resolve().parents[2]
VENV_DIR = ROOT_DIR / ".venv"
REQUIREMENTS_FILE = ROOT_DIR / "requirements" / "all.txt"

BIN_DIR = VENV_DIR / "Scripts" if sys.platform == "win32" else VENV_DIR / "bin"
DOR_EXE = ".exe" if sys.platform == "win32" else ""
PYTHON_COMMAND = str(BIN_DIR / f"python{DOR_EXE}")
JUPYTER_COMMAND = str(BIN_DIR / f"jupyter{DOR_EXE}")
PIP_INSTALL = [PYTHON_COMMAND, "-m", "pip", "install"]


def run_command(cmd: Union[List[str], str], cwd: Optional[str] = None) -> None:
    """Run a command.

    Parameters
    ----------
    cmd : Union[List[str], str]
        The command to run.

    cwd : Optional[str], optional
        The current working directory, by default None.
    """
    if isinstance(cmd, str):
        cmd = cmd.split()
    print(f"Running command: {cmd}")
    if cwd is None:
        cwd = str(ROOT_DIR)
    env = os.environ
    subprocess.run(cmd, env=env, cwd=cwd, check=True)  # nosemgrep # nosec


def create_venv() -> None:
    """Create a virtual environment."""
    if BIN_DIR.is_dir() and os.access(PYTHON_COMMAND, os.X_OK):
        # pylint: disable=inconsistent-quotes
        os.environ["PATH"] = f"{BIN_DIR}{os.pathsep}{os.environ['PATH']}"
        return
    if BIN_DIR.is_dir():
        shutil.rmtree(BIN_DIR)
    print("Creating virtual environment...")
    run_command([sys.executable, "-m", "venv", str(VENV_DIR)])
    # pylint: disable=inconsistent-quotes
    os.environ["PATH"] = f"{BIN_DIR}{os.pathsep}{os.environ['PATH']}"


def pip_upgrade_base() -> None:
    """Upgrade pip setuptools and wheel."""
    run_command(PIP_INSTALL + ["--upgrade", "pip", "wheel"])


def install_requirements() -> None:
    """Install requirements."""
    print("Installing requirements...")
    cmd = PIP_INSTALL + ["-r", str(REQUIREMENTS_FILE)]
    run_command(cmd)


def init_jupyter_extension() -> None:
    """Initialize the Jupyter extension."""
    jlpm_command = shutil.which("jlpm")
    if not jlpm_command:  # in venv?
        jlpm_exe = "jlpm" + (".exe" if sys.platform == "win32" else "")
        jlpm_path = BIN_DIR / jlpm_exe
        if jlpm_path.is_file() and os.access(jlpm_path, os.X_OK):
            jlpm_command = str(jlpm_path)
    if not jlpm_command:
        print("jlpm is not found as a command. Please install it first.")
        return
    run_command([jlpm_command, "install"], cwd=str(ROOT_DIR))
    run_command([jlpm_command, "build"], cwd=str(ROOT_DIR))
    run_command(PIP_INSTALL + ["-e", "."], cwd=str(ROOT_DIR))
    _cmd = ["labextension", "develop", "--overwrite", "."]
    extension_cmd = [JUPYTER_COMMAND] + _cmd
    run_command(extension_cmd, cwd=str(ROOT_DIR))


def done() -> None:
    """Print the done message."""
    dev_run_path = os.path.join("scripts", "dev", "run.py")
    msg = (
        "Done. \n"
        "You can run 'make dev' to start jupyter-lab with the "
        "installed extension.\n"
        "If make is not available, you can run \n"
        f"`python {dev_run_path}` instead."
    )
    print(msg)


def main() -> None:
    """Initialize this project."""
    create_venv()
    pip_upgrade_base()
    install_requirements()
    init_jupyter_extension()
    done()


if __name__ == "__main__":
    main()
