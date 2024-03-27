function envGet(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Test parameters
 */
export const PRIVATE_KEY = envGet("PRIVATE_KEY");
const IPC_NODES_COUNT = 21;
export const PROVIDERS_NUM = 16;
export const BATCH_SIZE = 1;
export const BUFFER_BATCHES = 8;
export const MAX_DIFFICULTY = "0x008f" + "ff".repeat(30);
export const DEFAULT_CONFIRMATIONS = 1;

/**
 * API URLS
 */
export const ETH_API_URL = (n: number) =>
  `http://127.0.0.1:85${45 + (n % IPC_NODES_COUNT)}`;
export const DEFAULT_ETH_API_URL = ETH_API_URL(0);
export const CCP_RPC_URL = "http://127.0.0.1:9393";

/**
 * PATHS
 */
export const PROVIDERS_PATH = "providers.json";
export const METRICS_PATH = "metrics.json";
