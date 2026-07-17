#!/bin/sh

set -eu

usage() {
    cat <<'EOF'
Usage: ./scripts/publish-ghcr.sh [--dry-run] [IMAGE_TAG]

Build and push the Mission Control API and frontend images for linux/amd64.

Environment variables:
  GHCR_OWNER    GHCR account or organization (default: gmoigneu)
  IMAGE_TAG     Image tag when no positional tag is provided (default: latest)

Examples:
  ./scripts/publish-ghcr.sh
  ./scripts/publish-ghcr.sh v1.2.3
  env GHCR_OWNER=my-org IMAGE_TAG=v1.2.3 ./scripts/publish-ghcr.sh
  ./scripts/publish-ghcr.sh --dry-run
EOF
}

dry_run=false

if [ "${1:-}" = "--dry-run" ]; then
    dry_run=true
    shift
fi

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
    exit 0
fi

if [ "$#" -gt 1 ]; then
    usage >&2
    exit 2
fi

ghcr_owner=${GHCR_OWNER:-gmoigneu}
image_tag=${1:-${IMAGE_TAG:-latest}}

case "$ghcr_owner" in
    "" | *[!A-Za-z0-9_.-]*)
        printf 'Invalid GHCR_OWNER: %s\n' "$ghcr_owner" >&2
        exit 2
        ;;
esac

case "$image_tag" in
    "" | *[!A-Za-z0-9_.-]*)
        printf 'Invalid image tag: %s\n' "$image_tag" >&2
        exit 2
        ;;
esac

script_dir=$(
    CDPATH= cd -- "$(dirname -- "$0")"
    pwd
)
repo_root=$(dirname -- "$script_dir")

api_image="ghcr.io/$ghcr_owner/mission-control-api:$image_tag"
frontend_image="ghcr.io/$ghcr_owner/mission-control-frontend:$image_tag"

build_and_push() {
    image=$1
    context=$2

    printf 'Building and pushing %s for linux/amd64\n' "$image"

    if [ "$dry_run" = true ]; then
        printf 'docker buildx build --platform linux/amd64 --tag %s --push %s\n' \
            "$image" "$context"
        return
    fi

    docker buildx build \
        --platform linux/amd64 \
        --tag "$image" \
        --push \
        "$context"
}

if [ "$dry_run" = false ]; then
    if ! command -v docker >/dev/null 2>&1; then
        printf 'Docker is required but was not found in PATH.\n' >&2
        exit 1
    fi

    if ! docker buildx version >/dev/null 2>&1; then
        printf 'Docker Buildx is required but is not available.\n' >&2
        exit 1
    fi
fi

build_and_push "$api_image" "$repo_root/backend"
build_and_push "$frontend_image" "$repo_root/frontend"

if [ "$dry_run" = true ]; then
    printf 'Dry run complete; no images were built or pushed.\n'
else
    printf 'Published both images with tag %s.\n' "$image_tag"
fi
