import { ethers } from "ethers";
import * as prom from "prom-client";
import PQueue from "p-queue";
import { DealClient } from "@fluencelabs/deal-ts-clients";

import { Communicate, type Solution, type Request } from "./communicate.js";
import { loadConfig } from "./config.js";
import { delay } from "./utils.js";

const CONCURRENCY_SUBMITS = 1;
const BUFFER_PROOFS = 10;

const config = loadConfig("config.json");

const rpc = new ethers.JsonRpcProvider(config.test_rpc_url);
const signer = new ethers.Wallet(config.provider_sk, rpc);
const client = new DealClient(signer, "local");

const communicate = new Communicate();

const capacity = await client.getCapacity();

let globalNonce = await capacity.getGlobalNonce();
const difficulty = await capacity.difficulty();

console.info("Initial difficulty: ", difficulty);
console.info("Initial global nonce: ", globalNonce);

const registry = new prom.Registry();
const summary = new prom.Summary({
  name: "proofs",
  help: "Proofs summary",
  registers: [registry],
});

const queue = new PQueue({ concurrency: CONCURRENCY_SUBMITS });

// const difficultyUpdated = capacity.getEvent("DifficultyUpdated");
// capacity.on(difficultyUpdated, (difficulty: string) => {});

communicate.onSolution(async (solution: Solution) => {
  if (queue.size >= BUFFER_PROOFS) {
    return;
  }
  await queue.add(async () => {
    const end = summary.startTimer();
    try {
      await capacity.submitProof(
        solution.unit_id,
        solution.g_nonce,
        solution.nonce,
        solution.hash
      );
    } catch (e) {
      console.error("Failed to submit proof: ", e);
    } finally {
      end();
    }
  });
});

communicate.request({ globalNonce, unitId: config.unit_id! });

console.log("Waiting for solution...");

for (let i = 0; i < 10000; i++) {
  const globalNonceNew = await capacity.getGlobalNonce();
  if (globalNonceNew !== globalNonce) {
    globalNonce = globalNonceNew;
    communicate.request({ globalNonce, unitId: config.unit_id! });
    queue.clear();
    console.log("Updated global nonce: ", globalNonce);
  }
  await delay(500);
  const metrics = await registry.metrics();
  console.log("Pending proofs:", queue.size)
  console.log(metrics);
}
