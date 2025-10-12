# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Lint Python source code in the my_package and tests directories."""

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


def run_command(args: list[str], quiet: bool = False) -> None:
    """Run a command.

    Parameters
    ----------
    args : List[str]
        List of arguments to pass to the command.
    quiet : bool
        Skip printing what will be executed.
    """
    if not quiet:
        args_str = " ".join(args).replace(str(ROOT_DIR), ".")
        print(f"Running command: {args_str}")
    subprocess.run(  # nosemgrep # nosec
        args,
        cwd=ROOT_DIR,
        stdout=sys.stdout,
        stderr=subprocess.STDOUT,
        check=True,
    )


def ensure_requirements() -> None:
    """Ensure the development requirements are installed."""
    dev_requirements_file = ROOT_DIR / "requirements" / "dev.txt"
    test_requirements_file = ROOT_DIR / "requirements" / "test.txt"
    run_command(
        [
            get_executable(),
            "-m",
            "pip",
            "install",
            "-qq",
            "-r",
            str(dev_requirements_file),
            "-r",
            str(test_requirements_file),
        ],
        quiet=True,
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
    run_command([get_executable(), "-m", "isort", "--check-only", "."])


def run_black() -> None:
    """Run black."""
    ensure_command_exists("black")
    run_command(
        [
            get_executable(),
            "-m",
            "black",
            "--check",
            "--config",
            "pyproject.toml",
            ".",
        ]
    )


def run_mypy() -> None:
    """Run mypy."""
    ensure_command_exists("mypy")
    run_command(
        [
            get_executable(),
            "-m",
            "mypy",
            "--config",
            "pyproject.toml",
            ".",
        ]
    )


def run_pyright() -> None:
    """Run pyright."""
    ensure_command_exists("pyright")
    executable = get_executable()
    run_command(
        [
            executable,
            "-m",
            "basedpyright",
            "--pythonpath",
            executable,
            "--project",
            "pyproject.toml",
            "waldiez_jupyter",
            "scripts",
        ]
    )


def run_flake8() -> None:
    """Run flake8."""
    ensure_command_exists("flake8")
    run_command([get_executable(), "-m", "flake8", "--config=.flake8"])


def run_pydocstyle() -> None:
    """Run pydocstyle."""
    ensure_command_exists("pydocstyle")
    run_command(
        [
            get_executable(),
            "-m",
            "pydocstyle",
            "--config",
            "pyproject.toml",
            ".",
        ]
    )


def run_bandit() -> None:
    """Run bandit."""
    ensure_command_exists("bandit")
    run_command(
        [
            get_executable(),
            "-m",
            "bandit",
            "-r",
            "-c",
            "pyproject.toml",
            ".",
        ]
    )


def run_yamllint() -> None:
    """Run yamllint."""
    ensure_command_exists("yamllint")
    run_command(
        [
            get_executable(),
            "-m",
            "yamllint",
            "-c",
            ".yamllint.yaml",
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
            "check",
            "--config",
            "pyproject.toml",
            ".",
        ]
    )


def run_pylint() -> None:
    """Run pylint."""
    ensure_command_exists("pylint")
    run_command(
        [get_executable(), "-m", "pylint", "--rcfile=pyproject.toml", "."]
    )


def run_all() -> None:
    """Run all actions."""
    run_isort()
    run_black()
    run_mypy()
    run_pyright()
    run_flake8()
    run_pydocstyle()
    run_bandit()
    run_yamllint()
    run_ruff()
    run_pylint()


def main() -> None:
    """Run linters."""

    if "--no-deps" not in sys.argv:
        ensure_requirements()
    single_action = False
    if "black" in sys.argv or "--black" in sys.argv:
        single_action = True
        run_black()
    if "mypy" in sys.argv or "--mypy" in sys.argv:
        single_action = True
        run_mypy()
    if "pyright" in sys.argv or "--pyright" in sys.argv:
        single_action = True
        run_pyright()
    if "flake8" in sys.argv or "--flake8" in sys.argv:
        single_action = True
        run_flake8()
    if "bandit" in sys.argv or "--bandit" in sys.argv:
        single_action = True
        run_bandit()
    if "ruff" in sys.argv or "--ruff" in sys.argv:
        single_action = True
        run_ruff()
    if "pylint" in sys.argv or "--pylint" in sys.argv:
        single_action = True
        run_pylint()
    if not single_action:
        run_all()


if __name__ == "__main__":
    main()
