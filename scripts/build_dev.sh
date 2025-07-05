#!/usr/bin/env sh
# shellcheck disable=SC2086

HERE="$(dirname "$(readlink -f "$0")")"
ROOT_DIR="$(dirname "$HERE")"
DOT_LOCAL="${ROOT_DIR}/.local"

PY_GIT_REPO="https://github.com/waldiez/waldiez.git"
REACT_GIT_REPO="https://github.com/waldiez/waldiez.git"

react_branch="dev"
python_branch="dev"
dry_run="false"
api_url_base="api"
react_build=""
python_build=""

if [ ! -d "$DOT_LOCAL" ]; then
    mkdir -p "$DOT_LOCAL"
fi
cd "$ROOT_DIR" || exit 1

ensure_bun() {
    if ! command -v bun > /dev/null 2>&1; then
        echo "bun could not be found, please install bun"
        exit 1
    fi
}
ensure_bun

ensure_yarn() {
    if ! command -v yarn > /dev/null 2>&1; then
        echo "yarn could not be found, please install yarn"
        exit 1
    fi
}
ensure_yarn

while [ $# -gt 0 ]; do
    case "$1" in
        --react-branch)
            shift
            react_branch="$1"
        ;;
        --python-branch)
            shift
            python_branch="$1"
        ;;
        --dry-run)
            dry_run="true"
        ;;
        --api-url-base)
            shift
            api_url_base="$1"
        ;;
        --help)
            echo "Usage: $0 [--react-branch <branch>] [--python-branch <branch>] [--dry-run]"
            echo "  --react-branch <branch>   Specify the react branch to use (default: main)"
            echo "  --python-branch <branch>  Specify the python branch to use (default: main)"
            echo "  --dry-run                 Do not install anything, just show what would be done"
            exit 0
        ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--react-branch <branch>] [--python-branch <branch>] [--dry-run]"
            exit 1
        ;;
    esac
    shift
done

api_url_base="https://${api_url_base%/}.waldiez.io"

check_local_react_build() {
    found_file=""
    for file in "${DOT_LOCAL}"/*; do
        if [ -f "$file" ] && \
        printf '%s\n' "$file" | grep -q 'waldiez-react' && \
        (printf '%s\n' "$file" | grep -qE '\.tgz$|\.tar\.gz$'); then
            found_file="$file"
            break
        fi
    done
    if [ -n "${found_file}" ]; then
        echo "${found_file#"${ROOT_DIR}"/}"
    else
        echo ""
    fi
}

check_local_python_build() {
    found_file=""
    for file in "${DOT_LOCAL}"/*; do
        if [ -f "$file" ] && \
        printf '%s\n' "$file" | grep -q 'waldiez' && \
        (printf '%s\n' "$file" | grep -qE '\.whl$'); then
            found_file="$file"
            break
        fi
    done
    if [ -n "$found_file" ]; then
        echo "${found_file#"${ROOT_DIR}"/}"
    else
        echo ""
    fi
}

if [ "${dry_run}" = "true" ]; then
    echo "Running in dry run mode, no changes will be made"
    echo "react_branch: $react_branch"
    echo "python_branch: $python_branch"
    react_build="$(check_local_react_build)"
    python_build="$(check_local_python_build)"
    if [ -n "$react_build" ]; then
        echo "React build found: $react_build"
    else
        echo "No React build found, will use git"
        react_build="${DOT_LOCAL}/waldiez.tgz"
    fi
    echo "react_build: $react_build"
    if [ -n "$python_build" ]; then
        echo "Python build found: $python_build"
    else
        echo "No Python build found, will use git"
        python_build="${DOT_LOCAL}/waldiez.whl"
    fi
    echo "python_build: $python_build"
    exit 0
fi

use_react_from_git() {
    if [ -d "${DOT_LOCAL}/waldiez-react" ]; then
        rm -rf "${DOT_LOCAL}/waldiez-react"
    fi
    if [ -f "${DOT_LOCAL}/waldiez.tgz" ]; then
        rm -f "${DOT_LOCAL}/waldiez.tgz"
    fi
    git clone "${REACT_GIT_REPO}" -b "$react_branch" "${DOT_LOCAL}/waldiez-react"
    cd "${DOT_LOCAL}/waldiez-react" || exit 1
    echo "Using React branch: $react_branch"
    echo "Using API URL base: $api_url_base"
    echo "HUB_API_URL=${api_url_base}" > .env
    . ./.env
    bun install
    bun run archive
    mv out/archive/waldiez-react-*.tgz "${DOT_LOCAL}/waldiez.tgz"
    react_build=".local/waldiez.tgz"
    rm -rf "${DOT_LOCAL}/waldiez-react"
    cd "${ROOT_DIR}" || exit 1
}

handle_react() {
    react_build="$(check_local_react_build)"
    if [ -z "$react_build" ]; then
        use_react_from_git
    fi
}

build_js_lib() {
    if [ -z "${react_build}" ]; then
        echo "no react build available"
        exit 1
    fi
    if [ ! -f "${react_build}" ]; then
        echo "no react build file found"
        exit 1
    fi
    # there should be a package.json in ROOT_DIR
    if [ ! -f "${ROOT_DIR}/package.json" ]; then
        echo "no package.json found in ${ROOT_DIR}"
        exit 1
    fi
    yarn remove @waldiez/react > /dev/null 2>&1 || true
    yarn add "@waldiez/react@file:${react_build}" || (find /tmp -name build.log -exec cat {} \; && false)
    yarn build:lib:prod || (find /tmp -name build.log -exec cat {} \; && false)
    yarn build || (find /tmp -name build.log -exec cat {} \; && false)
    # if in a repo (if in container build, this will not be the case)
    git restore package.json yarn.lock > /dev/null 2>&1 || true
}


# echo "react_build: $react_build"
# echo "python_build: $python_build"
handle_react
echo "react_build: $react_build"
build_js_lib

######################################################################
# python part
######################################################################

find_main_requirements() {
    if [ -f "${ROOT_DIR}/requirements/main.txt" ]; then
        echo "${ROOT_DIR}/requirements/main.txt"
        elif [ -f "${ROOT_DIR}/requirements.txt" ]; then
        echo "${ROOT_DIR}/requirements.txt"
        elif [ -f "/tmp/requirements.txt" ]; then
        echo "/tmp/requirements.txt"
    else
        echo ""
    fi
}

requirements_file="$(find_main_requirements)"
if [ -z "$requirements_file" ]; then
    echo "no requirements file found"
    exit 1
fi
extra_pip_args=""

# Check if in a virtualenv
in_venv=$(python3 -c 'import sys; print(hasattr(sys, "real_prefix") or (getattr(sys, "base_prefix", sys.prefix) != sys.prefix))')

# If not in venv, consider --user and --break-system-packages
if [ "$in_venv" != "True" ]; then
    # Check if pip warns about system-managed installation (PEP 668)
    pip_output=$(python3 -m pip install --dry-run -r "$requirements_file" 2>&1)

    if echo "$pip_output" | grep -q "externally managed"; then
        extra_pip_arg="${extra_pip_arg} --break-system-packages"
    fi

    # Only add --user if not root
    if [ "$(id -u)" -ne 0 ]; then
        extra_pip_args="${extra_pip_arg} --user"
    fi
fi

before_python_whl() {
    before_requirements_packages="pip setuptools wheel build jupyter jupyterhub jupyterlab ipywidgets ipykernel"
    python3 -m pip install --upgrade $extra_pip_args $before_requirements_packages
    python3 -m pip install ${extra_pip_args} -r ${requirements_file}
    python3 -m build --wheel . && \
    python3 -m pip install --force ${extra_pip_args} dist/*.whl && \
    python3 -m pip uninstall -y waldiez autogen-agentchat
}

use_python_from_git() {
    # :
    # pip install --user git+https://github.com/waldiez/python.git@$PY_BRANCH
    if [ -d "${DOT_LOCAL}/waldiez-py" ]; then
        rm -rf "${DOT_LOCAL}/waldiez-py"
    fi
    git clone "${PY_GIT_REPO}" -b "$python_branch" "${DOT_LOCAL}/waldiez-py"
    cd "${DOT_LOCAL}/waldiez-py" || exit 1
    python3 -m pip install --upgrade ${extra_pip_args} pip setuptools wheel build
    python3 -m pip install ${extra_pip_args} -r requirements/main.txt
    python3 -m build --wheel .
    build_file_path="$(ls dist/*.whl)"
    if [ -z "$build_file_path" ]; then
        echo "no build file found"
        exit 1
    fi
    # remove "dist" from path
    build_file_path="${build_file_path#dist/}"
    mv "dist/${build_file_path}" "${DOT_LOCAL}/${build_file_path}"
    python_build=".local/${build_file_path}"
    cd "${ROOT_DIR}" || exit 1
    rm -rf "${DOT_LOCAL}/waldiez-py" > /dev/null 2>&1 || true
}


handle_python() {
    before_python_whl
    python_build="$(check_local_python_build)"
    if [ -z "$python_build" ]; then
        use_python_from_git
    fi
    if [ -z "$python_build" ]; then
        echo "no python build available"
        exit 1
    fi
    if [ ! -f "${python_build}" ]; then
        echo "no python build file found"
        exit 1
    fi
    python3 -m pip install --force ${extra_pip_args} ${python_build}
}

handle_python
echo "Done"
echo "python_build: $python_build"
echo "react_build: $react_build"
