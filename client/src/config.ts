import fs from "fs";

export interface Config {
  private_keys: string[];
}

export function readConfig(path: string): Config {
  return JSON.parse(fs.readFileSync(path).toString());
}

export function writeConfig(path: string, config: Config) {
  fs.writeFileSync(path, JSON.stringify(config, null, 2));
}
