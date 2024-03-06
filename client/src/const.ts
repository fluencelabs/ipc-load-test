export const METRICS_FILE = "metrics.json";

export const DEFAULT_CONFIRMATIONS = 1;
const IPC_NODES_COUNT = 7;
export const ETH_API_URL = (n: number) =>
  `http://127.0.0.1:85${45 + (n % IPC_NODES_COUNT)}`;
export const DEFAULT_ETH_API_URL = ETH_API_URL(0);

export const CCP_RPC_URL = "http://127.0.0.1:9393";
export const BUFFER_PROOFS = 32;
export const MAX_DIFFICULTY = "0x00" + "ff".repeat(31);

export const PROVIDERS_NUM = 4;
export const PRIVATE_KEY =
  "0x18356A8CEA9552795D13E6FF797FF5F88D7BC79FB4926A55D6B2341B2858400B";
