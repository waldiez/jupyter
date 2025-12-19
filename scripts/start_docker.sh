#!/usr/bin/env bash

set -e -o pipefail

# <project>/scripts
HERE="$(dirname "$(readlink -f "$0")")"
ROOT_DIR="$(dirname "${HERE}")"
cd "${ROOT_DIR}" || {
    log_error "Failed to change to root directory: $ROOT_DIR"
    exit 1
}
echo "root dir: ${ROOT_DIR}"

if [  -f "${ROOT_DIR}/.env" ]; then
    source "${ROOT_DIR}/.env"
fi

WALDIEZ_VERSION=${WALDIEZ_VERSION:-latest}
JUPYTER_PASSWORD=${JUPYTER_PASSWORD:-}

mkdir -p examples || {
    log_error "Failed to create examples folder"
    exit 1
}

echo "using: waldiez/jupyter:${WALDIEZ_VERSION}"
docker stop waldiez_jupyter > /dev/null 2>&1 || true
docker rm waldiez_jupyter > /dev/null 2>&1 || true
docker run \
  -d \
  --restart always \
  --name waldiez_jupyter \
  -p 8888:8888 \
  -v ${PWD}/examples:/home/waldiez/notebooks \
  -e JUPYTER_PASSWORD="${JUPYTER_PASSWORD}" \
   waldiez/jupyter:${WALDIEZ_VERSION}
