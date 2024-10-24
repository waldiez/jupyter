#!/usr/bin/env bash

set -e -o pipefail

HERE="$(dirname "$(readlink -f "$0")")"
ROOT_DIR="$(dirname "$HERE")"

cd "$ROOT_DIR" || exit 1


# dev mode
if [ -f "${ROOT_DIR}/.venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    . "${ROOT_DIR}/.venv/bin/activate"
fi

# prefer 'notebooks' or 'examples' as
# the working directory if they exist
if [ -d notebooks ]; then
    cd notebooks || exit 1
elif [ -d examples ]; then
    cd examples || exit 1
fi

# check if we can write to the directory we are in
# if we are in a volume mounted directory, we might
# need to chown it to the current user
can_write() {
    touch _test_write > /dev/null 2>&1 || true
    if [ -f .check ]; then
        rm _test_write
        return 0
    else
        return 1
    fi
}

super_user_do() {
    if [ "$(id -u)" = "0" ]; then
        "$@"
    else
        sudo "$@"
    fi
}

get_dir_to_chown() {
    _cwd="$(pwd)"
    to_chown="${ROOT_DIR}"
    if [ ! "${_cwd}" = "${ROOT_DIR}" ]; then
        if [ -d "${_cwd}/notebooks" ]; then
            to_chown="notebooks"
            cd ..
        elif [ -d "${_cwd}/notebooks" ]; then
            to_chown="examples"
            cd ..
        fi
    fi
    echo "${to_chown}"
}

chown_dir() {
    _cwd="$(pwd)"
    to_chown="$(get_dir_to_chown)"
    if [ -d "${to_chown}" ]; then
        echo "Changing ownership of ${to_chown} to $(id -u), cwd: ${_cwd}"
        super_user_do chown -R "$(id -u)" "${to_chown}"
    fi
    cd "${_cwd}" || exit 1
}

if ! can_write; then
    echo "Cannot write to the directory. Running \`sudo chown -R $(id -u) $(pwd)\`"
    chown_dir
    super_user_do rm -f _test_write
else
    rm -f _test_write
fi

if [ -n "${JUPYTER_PASSWORD}" ]; then
    echo "Jupyter password is set. Starting Jupyter with password."
    echo "Jupyter password: ${JUPYTER_PASSWORD}"
else
    echo "Jupyter password is not set. Starting Jupyter without password."
fi
if [ -n "${JUPYTER_TOKEN}" ]; then
    echo "Jupyter token is set. Starting Jupyter with token."
    echo "Jupyter token: ${JUPYTER_TOKEN}"
else
    echo "Jupyter token is not set. Starting Jupyter without token."
fi

PYTHONUNBUFFERED=1 jupyter lab \
    --no-browser \
    --ip="*" \
    --ServerApp.terminado_settings="shell_command=['/bin/bash']" \
    --ServerApp.token="${JUPYTER_TOKEN}" \
    --ServerApp.password="${JUPYTER_PASSWORD}" \
    --ServerApp.allow_origin='*' \
    --ServerApp.disable_check_xsrf=True
