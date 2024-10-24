#!/usr/bin/env bash

HERE="$(dirname "$(readlink -f "$0")")"
ROOT_DIR="$(dirname "$(dirname "$HERE")")"

cd "$ROOT_DIR" || exit 1

if [ -f "${ROOT_DIR}/.venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/.venv/bin/activate"
fi

jlpm
jlpm clean
jlpm build
pip install -e .
jupyter labextension develop --overwrite .
# python scripts/dev/run.py
