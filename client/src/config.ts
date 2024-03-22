import type { BytesLike } from "ethers";
import fs from "fs";

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

export function writeConfig(config: Config, file: string) {
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

export function readConfig(file: string): Config {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
