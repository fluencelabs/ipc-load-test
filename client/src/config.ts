import fs from "fs";
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

export const loadConfig = (filePath: string): Config => {
  try {
    const rawData = fs.readFileSync(filePath, "utf8");
    const config = JSON.parse(rawData);

    config.providers = config.providers || [];
    config.providers.forEach((provider: ProviderConfig, idx: number) => {
      provider.name = provider.name || `PROV${idx}`;
      provider.peers = provider.peers || [];

      if (!provider.sk) {
        throw new Error(`Provider ${provider.name} does not have a secret key`);
      }

      provider.peers.forEach((peer: PeerConfig, idx: number) => {
        if (!peer.owner_sk) {
          throw new Error(
            `Peer ${idx} of ${provider.name} does not have an owner`
          );
        }

        peer.cu_count = peer.cu_count || 0;
        peer.cu_ids = peer.cu_ids || [];
      });
    });

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
