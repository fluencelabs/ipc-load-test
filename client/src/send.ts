import { ethers } from "ethers";
import { DealClient } from "@fluencelabs/deal-ts-clients";

import { Communicate, type Solution, type Params } from "./communicate.js";
import { loadConfig } from "./config.js";
import { delay } from "./utils.js";

const config = loadConfig("config.json");

const rpc = new ethers.JsonRpcProvider(config.test_rpc_url);
const signer = new ethers.Wallet(config.provider_sk, rpc);
const client = new DealClient(signer, "local");

const communicate = new Communicate();

const capacity = await client.getCapacity();

let globalNonce = await capacity.getGlobalNonce();
const difficulty = await capacity.difficulty();

const params: Params = {
  unitId: config.unit_id,
  globalNonce: globalNonce,
  difficulty: difficulty,
};
console.info("Initial params: ", params);

communicate.updateParams(params);

const difficultyUpdated = capacity.getEvent("DifficultyUpdated");
capacity.on(difficultyUpdated, (difficulty: string) => {
  communicate.updateParams({ difficulty });
});

let proofSubmitted = 0;
communicate.onSolution(async (solution: Solution) => {
  if (proofSubmitted === 0) {
    proofSubmitted++;
    console.log("Got solution: ", solution);
    await capacity.submitProof(
      solution.unit_id,
      solution.g_nonce,
      solution.nonce,
      solution.hash
    );
    console.log("Submitted proof");
  }
});

console.log("Waiting for solution...");

for (let i = 0; i < 10000; i++) {
  const globalNonceNew = await capacity.getGlobalNonce();
  if (globalNonceNew !== globalNonce) {
    globalNonce = globalNonceNew;
    communicate.updateParams({ globalNonce });
    console.log("Updated global nonce: ", globalNonce);
  } else {
    console.log("No new global nonce");
  }
  await delay(10000);
}
