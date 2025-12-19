#!/usr/bin/env bash
set -euo pipefail

# Configuration
# shellcheck disable=SC2155
readonly SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
# shellcheck disable=SC2155
readonly ROOT_DIR="$(dirname "$SCRIPT_DIR")"
readonly LOG_PREFIX="[start.sh]"
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
#readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
   echo -e "${BLUE}${LOG_PREFIX} INFO:${NC} $*" >&2
}

log_error() {
   echo -e "${RED}${LOG_PREFIX} ERROR:${NC} $*" >&2
}

log_warn() {
   echo -e "${YELLOW}${LOG_PREFIX} WARN:${NC} $*" >&2
}

# Change to root directory
cd "$ROOT_DIR" || {
    log_error "Failed to change to root directory: $ROOT_DIR"
    exit 1
}

# Activate virtual environment if it exists
activate_venv() {
    local venv_activate="${ROOT_DIR}/.venv/bin/activate"
    if [[ -f "$venv_activate" ]]; then
        log_info "Activating virtual environment"
        # shellcheck disable=SC1090
        source "$venv_activate"
    fi
}

# Set working directory (prefer notebooks > examples > current)
set_working_directory() {
    if [[ -d "notebooks" ]]; then
        log_info "Using notebooks directory"
        cd notebooks || exit 1
    elif [[ -d "examples" ]]; then
        log_info "Using examples directory"
        cd examples || exit 1
    else
        log_info "Using root directory as working directory"
    fi
}

# Test if we can write to current directory
can_write_to_directory() {
    local test_file
    test_file=$(mktemp -p . .write_test.XXXXXX 2>/dev/null) && {
        rm -f "$test_file"
        return 0
    }
    return 1
}

# Fix directory ownership for container environments
fix_directory_ownership() {
    local current_dir target_dir
    current_dir=$(pwd)

    # Determine which directory to fix
    case "$(basename "$current_dir")" in
        "notebooks"|"examples")
            target_dir="$(basename "$current_dir")"
            cd .. || return 1
            ;;
        *)
            target_dir="."
            ;;
    esac

    if [[ -d "$target_dir" ]]; then
        log_info "Fixing ownership of $target_dir for user $(whoami) ($(id -u))"
        if [[ "$(id -u)" -eq 0 ]]; then
            chown -R "$(id -u)" "$target_dir"
        else
            sudo chown -R "$(id -u)" "$target_dir" 2>/dev/null || {
                log_warn "Could not fix ownership - sudo not available or permission denied"
                return 1
            }
        fi
    fi

    cd "$current_dir" || return 1
}

# Handle directory permissions
setup_directory_permissions() {
    if ! can_write_to_directory; then
        log_warn "Cannot write to current directory, attempting to fix permissions"
        if ! fix_directory_ownership; then
            log_error "Failed to fix directory permissions"
            exit 1
        fi

        # Test again after fixing
        if ! can_write_to_directory; then
            log_error "Still cannot write to directory after permission fix"
            exit 1
        fi
        log_info "Directory permissions fixed successfully"
    fi
}

# Generate hashed password for Jupyter
generate_hashed_password() {
    if [[ -n "${JUPYTER_PASSWORD:-}" ]]; then
        python3 -c "from jupyter_server.auth import passwd; print(passwd('${JUPYTER_PASSWORD}'))" 2>/dev/null || {
            log_error "Failed to hash Jupyter password"
            exit 1
        }
    fi
}

# Configure Jupyter authentication
configure_jupyter_auth() {
    local hashed_password password_required="False"

    # Handle password authentication
    if [[ -n "${JUPYTER_PASSWORD:-}" ]]; then
        log_info "Jupyter password authentication enabled"
        hashed_password=$(generate_hashed_password)
        password_required="True"
        export JUPYTER_HASHED_PASSWORD="$hashed_password"
    else
        log_info "No Jupyter password set"
        export JUPYTER_HASHED_PASSWORD=""
    fi

    # Handle token authentication
    if [[ -n "${JUPYTER_TOKEN:-}" ]]; then
        log_info "Jupyter token authentication enabled"
        # Don't log the actual token for security
    else
        log_info "No Jupyter token set"
        export JUPYTER_TOKEN=""
    fi

    export JUPYTER_PASSWORD_REQUIRED="$password_required"
}

# Set up environment
setup_environment() {
    export SHELL="$(which bash)"
    export TERM=xterm-256color
    export PYTHONUNBUFFERED=1
    export JUPYTER_ENABLE_LAB=yes
}

# Start Jupyter Lab
start_jupyter() {

    # Configure CORS (defaults to permissive for container environments)
    local allowed_origins="${JUPYTER_ALLOWED_ORIGINS:-*}"
    if [[ "$allowed_origins" == "*" ]]; then
        log_warn "Using permissive CORS policy (allow_origin='*')"
    else
        log_info "Using custom allowed origins pattern: $allowed_origins"
    fi

    # Configure XSRF protection (defaults to disabled for container environments)
    local disable_check_xsrf="True"
    if [[ "${JUPYTER_DISABLE_XSRF:-true}" == "true" ]]; then
        log_warn "XSRF protection is disabled"
        disable_check_xsrf="True"
    else
        log_info "XSRF protection is enabled"
        disable_check_xsrf="False"
    fi
    # let's try to handle: 'IOPub data rate exceeded'.
    # defaults:
    # ZMQChannelsWebsocketConnection.iopub_data_rate_limit=1000000.0 (bytes/sec)
    # ZMQChannelsWebsocketConnection.rate_limit_window=3.0 (secs)
    jupyter lab \
        --no-browser \
        --ip="*" \
        --ServerApp.terminado_settings="{'shell_command': ['/bin/bash']}" \
        --IdentityProvider.token="${JUPYTER_TOKEN}" \
        --IdentityProvider.hashed_password="${JUPYTER_HASHED_PASSWORD}" \
        --IdentityProvider.password_required="${JUPYTER_PASSWORD_REQUIRED}" \
        --ServerApp.allow_origin="${allowed_origins}" \
        --ServerApp.disable_check_xsrf="${disable_check_xsrf}" \
        --ZMQChannelsWebsocketConnection.iopub_data_rate_limit=2000000 \
        --ZMQChannelsWebsocketConnection.rate_limit_window=2
}

# Cleanup function for graceful shutdown
cleanup() {
    log_info "Received shutdown signal, cleaning up..."
    # Add any cleanup tasks here
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Main execution
main() {
    log_info "Starting Jupyter Lab container setup"

    activate_venv
    set_working_directory
    setup_directory_permissions
    configure_jupyter_auth
    setup_environment
    start_jupyter
}

# Run main function
main "$@"
