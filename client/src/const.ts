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
export const BUFFER_BATCHES = 8;
export const CCP_DIFFICULTY = "0x0fff" + "ff".repeat(30);
export const CHAIN_GNONCE_HARDCODED = "0x" + "00".repeat(32);
export const DEFAULT_CONFIRMATIONS = 1;

export function idToNodeId(id: number) {
  const allowed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  id = id % allowed.length;
  return allowed[id];
}

/**
 * API URLS
 */
export const ETH_API_URL = (i: number) => {
  return `http://ipc-${idToNodeId(i)}.stage.fluence.dev:8545`;
};
// export const ETH_API_URL = (i: number) => `http://127.0.0.1:85${45 + (i % 12)}`;
export const DEFAULT_ETH_API_URL = ETH_API_URL(0);
export const CCP_RPC_URL = "http://127.0.0.1:9393";
