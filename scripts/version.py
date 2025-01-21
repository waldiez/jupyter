# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.

"""Handle the version of the package."""
# > - `scripts/version.py`: the script to update the version
# >    The script should expect the arguments `--set` or `--get`
# >    and it should either return `x.y.z` or set the version to `x.y.z`.

import argparse
import json
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
PACKAGE_JSON_PATH = ROOT_DIR / "package.json"

if not PACKAGE_JSON_PATH.exists():
    raise FileNotFoundError("The package.json file was not found")


def get_version() -> str:
    """Get the current version.

    Returns
    -------
    str
        The current version in the format x.y.z
    """
    with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as file:
        data = json.load(file)
    return data["version"]


def set_version(version_string: str) -> None:
    """Set the version to the given value.

    Parameters
    ----------
    version_string : str
        The version string in the format x.y.z

    Raises
    ------
    ValueError
        If the version string is not in the format x.y.z
        If the version string was not found in the _version.py file
    FileNotFoundError
        If the _version.py file was not found
    """
    try:
        major_str, minor_str, patch_str = version_string.split(".")
        major, minor, patch = int(major_str), int(minor_str), int(patch_str)
    except BaseException as error:
        raise ValueError(
            "The version string must be in the format x.y.z"
        ) from error
    new_version = f"{major}.{minor}.{patch}"
    with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as file:
        data = json.load(file)
    data["version"] = new_version
    with open(PACKAGE_JSON_PATH, "w", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, indent=4)


def update_waldiez_dependency(version_string: str) -> None:
    """Set the version to the given value in pyproject.toml.

    dependencies = [
        "jupyter_server>=x.y.z",
        "pathvalidate==z.y.z",
        "waldiez>=x.y.z",  <- this one
    ]

    Parameters
    ----------
    version_string : str
        The version string in the format x.y.z

    Raises
    ------
    FileNotFoundError
        If the pyproject.toml file was not found
    RuntimeError
        If the package is not found in the pyproject.toml file
    """
    pyproject_toml_path = ROOT_DIR / "pyproject.toml"
    if not pyproject_toml_path.exists():
        raise FileNotFoundError("The pyproject.toml file was not found")

    with open(pyproject_toml_path, "r", encoding="utf-8") as file:
        lines = file.readlines()

    found_dep = False
    for i, line in enumerate(lines):
        if "waldiez>" in line or "waldiez=" in line or "waldiez<" in line:
            lines[i] = f'    "waldiez=={version_string}",' + "\n"
            found_dep = True
            break
    if not found_dep:
        raise RuntimeError(
            "The waldiez package was not found in the pyproject.toml file"
        )

    with open(pyproject_toml_path, "w", encoding="utf-8", newline="\n") as file:
        file.writelines(lines)


def main() -> None:
    """Handle the command line arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--set", help="Set the version to the given value in the format x.y.z"
    )
    parser.add_argument(
        "--get", action="store_true", help="Get the current version"
    )
    args, _ = parser.parse_known_args()

    if args.set:
        set_version(args.set)
        update_waldiez_dependency(args.set)
    elif args.get:
        print(get_version())
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
