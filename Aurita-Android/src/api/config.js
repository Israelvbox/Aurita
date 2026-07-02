import { jellyfin } from './jellyfin.js';

export function getServiceUrl() {
  return jellyfin.baseUrl;
}

export const SERVICE_TIMEOUT_MS = 8000;
