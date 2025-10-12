# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Run python formatters."""

import os
import shutil
import subprocess  # nosemgrep # nosec
import sys
from pathlib import Path

# pylint: disable=duplicate-code  # also in ./lint.py
# noinspection DuplicatedCode
ROOT_DIR = Path(__file__).resolve().parent.parent


def in_hatch_environment() -> bool:
    """Check if the script is running in a Hatch environment.

    Returns
    -------
    bool
        True if the script is running in a Hatch environment, False otherwise.
    """
    return (
        "HATCH_ENV_ACTIVE" in os.environ
        and len(os.environ["HATCH_ENV_ACTIVE"]) > 0
    )


def prefer_uv() -> bool:
    """Check if we should prefer to use uv.

    Returns
    -------
    bool
        True if we should prefer to use uv, False otherwise.
    """
    if not shutil.which("uv"):
        return False
    return (ROOT_DIR / ".uv").is_file()


def ensure_venv() -> None:
    """Ensure the virtual environment executable exists."""
    if os.path.exists(ROOT_DIR / ".venv") or in_hatch_environment():
        return
    if prefer_uv():
        print("Creating virtual environment with uv...")
        run_command(["uv", "venv", str(ROOT_DIR / ".venv")])
        run_command(["uv", "sync"])
        run_command(["uv", "pip", "install", "-U", "pip"])
    else:
        print("Creating virtual environment...")
        run_command([sys.executable, "-m", "venv", str(ROOT_DIR / ".venv")])
        run_command(
            [
                str(ROOT_DIR / ".venv" / "bin" / "python"),
                "-m",
                "pip",
                "install",
                "-U",
                "pip",
            ]
        )


def get_executable() -> str:
    """Get the path to the Python executable.

    Returns
    -------
    str
        The path to the Python executable.
    """
    if os.getenv("CI") == "true":
        return sys.executable
    if in_hatch_environment():
        return sys.executable
    if not os.path.exists(ROOT_DIR / ".venv"):
        ensure_venv()
    if sys.platform != "win32":
        if os.path.exists(ROOT_DIR / ".venv" / "bin" / "python"):
            return str(ROOT_DIR / ".venv" / "bin" / "python")
    if os.path.exists(ROOT_DIR / ".venv" / "Scripts" / "python.exe"):
        return str(ROOT_DIR / ".venv" / "Scripts" / "python.exe")
    return sys.executable


def run_command(args: list[str]) -> None:
    """Run a command.

    Parameters
    ----------
    args : List[str]
        List of arguments to pass to the command.
    """
    args_str = " ".join(args).replace(str(ROOT_DIR), ".")
    print(f"Running command: {args_str}")
    subprocess.run(  # nosemgrep # nosec
        args,
        cwd=ROOT_DIR,
        stdout=sys.stdout,
        stderr=subprocess.STDOUT,
        check=True,
    )


def ensure_dev_requirements() -> None:
    """Ensure the development requirements are installed."""
    requirements_file = ROOT_DIR / "requirements" / "dev.txt"
    run_command(
        [
            get_executable(),
            "-m",
            "pip",
            "install",
            "-r",
            str(requirements_file),
        ]
    )


def ensure_command_exists(command: str) -> None:
    """Ensure a command exists.

    Parameters
    ----------
    command : str
        Command to check.
    """
    if not shutil.which(command):
        run_command([get_executable(), "-m", "pip", "install", command])


def run_isort() -> None:
    """Run isort."""
    ensure_command_exists("isort")
    run_command([get_executable(), "-m", "isort", "."])


def run_autoflake() -> None:
    """Run autoflake."""
    ensure_command_exists("autoflake")
    run_command(
        [
            get_executable(),
            "-m",
            "autoflake",
            "--remove-all-unused-imports",
            "--remove-unused-variables",
            "--in-place",
            ".",
        ]
    )


def run_black() -> None:
    """Run black."""
    ensure_command_exists("black")
    run_command(
        [
            get_executable(),
            "-m",
            "black",
            "--config",
            "pyproject.toml",
            ".",
        ]
    )


def run_ruff() -> None:
    """Run ruff."""
    ensure_command_exists("ruff")
    run_command(
        [
            get_executable(),
            "-m",
            "ruff",
            "format",
            "--config",
            "pyproject.toml",
            ".",
        ]
    )


def main() -> None:
    """Run python formatters."""
    ensure_dev_requirements()
    run_isort()
    run_autoflake()
    run_black()
    run_ruff()


if __name__ == "__main__":
    main()
