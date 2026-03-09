#!/usr/bin/env bash
set -euo pipefail

ACR_NAME="${ACR_NAME:?Set ACR_NAME to your Azure Container Registry name}"
IMAGE_NAME="${IMAGE_NAME:-prism}"
TAG="${TAG:-latest}"
FULL_IMAGE="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${TAG}"

echo "Building image: ${FULL_IMAGE}"
docker build -t "${FULL_IMAGE}" .

echo "Pushing image: ${FULL_IMAGE}"
docker push "${FULL_IMAGE}"

echo "Done. Image pushed to ${FULL_IMAGE}"
