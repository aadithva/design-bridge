#!/usr/bin/env bash
set -euo pipefail

ACR_NAME="${ACR_NAME:?Set ACR_NAME to your Azure Container Registry name}"
IMAGE_NAME="${IMAGE_NAME:-design-review-bot}"
TAG="${TAG:-latest}"
FULL_IMAGE="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${TAG}"

RESOURCE_GROUP="${RESOURCE_GROUP:?Set RESOURCE_GROUP}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-design-review-bot}"

echo "Building and pushing image..."
bash "$(dirname "$0")/build-and-push.sh"

echo "Updating Container App: ${CONTAINER_APP_NAME}"
az containerapp update \
  --name "${CONTAINER_APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${FULL_IMAGE}"

echo "Deployment complete."
