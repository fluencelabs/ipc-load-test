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
export const PROVIDERS_NUM = 4;
export const BATCH_SIZE = 32;
export const BUFFER_BATCHES = 8;
export const MAX_DIFFICULTY = "0x00ff" + "ff".repeat(30);
export const DEFAULT_CONFIRMATIONS = 1;

/**
 * API URLS
 */
export const ETH_API_URL = (_: number) => "https://ipc.test.fluence.dev";
export const DEFAULT_ETH_API_URL = ETH_API_URL(0);
export const CCP_RPC_URL = "http://127.0.0.1:9393";

/**
 * PATHS
 */
export const PROVIDERS_PATH = "providers.json";
export const METRICS_PATH = "metrics.json";
