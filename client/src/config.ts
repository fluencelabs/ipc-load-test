import type { BytesLike } from "ethers";

export interface PeerConfig {
  cu_count: number;
  owner_sk: string;
  cu_ids: BytesLike[];
}

export interface ProviderConfig {
  name: string;
  sk: string;
  peers: PeerConfig[];
}

export interface Config {
  providers: ProviderConfig[];
}
