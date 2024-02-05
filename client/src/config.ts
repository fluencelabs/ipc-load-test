import fs from "fs";
import type { BytesLike } from "ethers";

export interface Config {
  provider_sk: string;
  provider_name: string;
  test_rpc_url: string;
  unit_id?: BytesLike | undefined;
}

const isValidConfig = (config: any): config is Config => {
  return (
    typeof config.provider_sk === "string" &&
    typeof config.provider_name === "string" &&
    typeof config.test_rpc_url === "string" &&
    (typeof config.unit_id === "string" || config.unit_id === undefined)
  );
};

export const loadConfig = (filePath: string): Config => {
  try {
    const rawData = fs.readFileSync(filePath, "utf8");
    const config = JSON.parse(rawData);

    if (!isValidConfig(config)) {
      throw new Error(`Invalid config file format: ${config}`);
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
