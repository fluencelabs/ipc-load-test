import { ethers, type BytesLike } from "ethers";
import * as prom from "prom-client";
import PQueue from "p-queue";
import { DealClient, type ICapacityInterface as Capacity } from "@fluencelabs/deal-ts-clients";

import { Communicate, type Solution } from "./communicate.js";
import { loadConfig, type ProviderConfig } from "./config.js";
import { delay } from "./utils.js";

const CONCURRENCY_SUBMITS = 1;
const BUFFER_PROOFS = 10;

const registry = new prom.Registry();
const submitted = new prom.Summary({
  name: "proofs_submitted",
  help: "Proofs summary",
  registers: [registry],
});
const errors = new prom.Counter({
  name: "errors",
  help: "Errors occured",
  registers: [registry],
});

class Provider {
  private readonly capacity: Capacity;
  private readonly cu_ids: Map<BytesLike, PQueue>;

  constructor(config: ProviderConfig, capacity: Capacity) {
    this.capacity = capacity;
    this.cu_ids = new Map(
      config.peers
        .flatMap((peer) => peer.cu_ids)
        .map((cu_id) => [cu_id, new PQueue({ concurrency: CONCURRENCY_SUBMITS })])
    );
  }

  clear() {
    for (const queue of this.cu_ids.values()) {
      queue.clear();
    }
  }

  getCapacity(): Capacity {
    return this.capacity;
  }

  hasCU(cu_id: BytesLike): Boolean {
    return this.cu_ids.has(cu_id);
  }

  async submitProof(
    solution: Solution
  ) {
    const queue = this.cu_ids.get(solution.unit_id)!;

    if (queue.size >= BUFFER_PROOFS) {
      return;
    }

    queue.add(async () => {
      const end = submitted.startTimer();
      try {
        console.log("Submitting proof: ", solution);
        await this.capacity.submitProof(
          solution.unit_id,
          solution.nonce,
          solution.hash
        );
      } catch (e) {
        errors.inc();
        console.error("Failed to submit proof: ", e);
      } finally {
        end();
      }
    });
  }
}

const config = loadConfig("config.json");

if (config.providers.length === 0) {
  throw new Error("No providers configured");
}

const allCUIds = config.providers.flatMap((provider) => 
  provider.peers.flatMap((peer) => peer.cu_ids)
);

if (allCUIds.length === 0) {
  throw new Error("No CU IDs configured");
}

const rpc = new ethers.JsonRpcProvider(config.test_rpc_url);

const providers: Provider[] = [];
for (const provider of config.providers) {
  const sk = (config.default_sk || provider.sk)!;
  const signer = new ethers.Wallet(sk, rpc);
  const client = new DealClient(signer, "local");
  const capacity = await client.getCapacity();
  providers.push(new Provider(provider, capacity));
}

// Get some capacity
const capacity = providers[0]!.getCapacity();

// const difficultyUpdated = capacity.getEvent("DifficultyUpdated");
// capacity.on(difficultyUpdated, (difficulty: string) => {});

let globalNonce = await capacity.getGlobalNonce();
const difficulty = await capacity.difficulty();

console.info("Initial difficulty: ", difficulty);
console.info("Initial global nonce: ", globalNonce);

const communicate = new Communicate();

communicate.onSolution(async (solution: Solution) => {
  const provider = providers.find((provider) => provider.hasCU(solution.unit_id));
  if (provider) {
    provider.submitProof(solution);
  } else {
    throw new Error("No provider for CU ID: " + solution.unit_id);
  }
});

communicate.request({ globalNonce, CUIds: allCUIds });

console.log("Waiting for solution...");

for (let i = 0; i < 10000; i++) {
  const globalNonceNew = await capacity.getGlobalNonce();
  if (globalNonceNew !== globalNonce) {
    globalNonce = globalNonceNew;
    communicate.request({ globalNonce, CUIds: allCUIds });
    for (const provider of providers) {
      provider.clear();
    }
    console.log("Updated global nonce: ", globalNonce);
  }
  await delay(500);
  const metrics = await registry.metrics();
  console.log(metrics);
}
