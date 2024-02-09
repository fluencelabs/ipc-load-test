import fs from "fs";
import type { BytesLike } from "ethers";

export interface PeerConfig {
  cu_count: number;
  cu_ids: BytesLike[];
};

export interface ProviderConfig {
  name: string;
  sk: string | undefined;
  peers: PeerConfig[];
};

export interface Config {
  test_rpc_url: string;
  default_sk: string | undefined;
  providers: ProviderConfig[];
};

export const loadConfig = (filePath: string): Config => {
  try {
    const rawData = fs.readFileSync(filePath, "utf8");
    const config = JSON.parse(rawData);

    config.providers = config.providers || [];
    config.providers.forEach((provider: ProviderConfig) => {
      provider.peers = provider.peers || [];
      provider.peers.forEach((peer: PeerConfig) => {
        peer.cu_ids = peer.cu_ids || [];
      });
    });

    const isDefaultSkSet = config.default_sk !== undefined;
    const areAllProviderSkSet = config.providers.every(
      (provider: ProviderConfig) => provider.sk !== undefined
    );

    if (!isDefaultSkSet && !areAllProviderSkSet) {
      throw new Error('Either default_sk must be set, or all provider sk must be set.');
    }

    return config;
  } catch (error) {
    throw new Error(`Failed to load config: ${error}`);
  }
};

export const saveConfig = (filePath: string, config: Config) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
};
