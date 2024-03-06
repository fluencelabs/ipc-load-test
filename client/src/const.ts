export const METRICS_FILE = "metrics.json";

function envGet(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

export const DEFAULT_CONFIRMATIONS = 1;
const IPC_NODES_COUNT = 7;
export const ETH_API_URL = (n: number) =>
  `http://127.0.0.1:85${45 + (n % IPC_NODES_COUNT)}`;
export const DEFAULT_ETH_API_URL = ETH_API_URL(0);

export const CCP_RPC_URL = "http://127.0.0.1:9393";
export const BUFFER_PROOFS = 32;
export const MAX_DIFFICULTY = "0x00" + "ff".repeat(31);

export const PROVIDERS_NUM = 4;
export const PRIVATE_KEY = envGet("PRIVATE_KEY");
