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
const proofs = new prom.Summary({
  name: "proofs",
  help: "Proofs summary",
  registers: [registry],
  labelNames: ["provider", "cu_id", "status"],
});

class Provider {
  private readonly config: ProviderConfig;
  private readonly capacity: Capacity;
  private readonly cu_ids: Map<BytesLike, PQueue>;

  constructor(config: ProviderConfig, capacity: Capacity) {
    this.config = config;
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
      const end = proofs.startTimer({
        "provider": this.config.name,
        "cu_id": solution.unit_id.toString(),
      });
      try {
        console.log("Submitting", solution);
        await this.capacity.submitProof(
          solution.unit_id,
          solution.nonce,
          solution.hash
        );
        end({ "status": "success" });
        console.log(
          "Submitted proof for provider",
          this.config.name,
          "cu",
          solution.unit_id
        );
        await delay(5000);
      } catch (e) {
        end({ "status": "error" });
        console.error(
          "Error submitting proof for provider",
          this.config.name,
          "cu",
          solution.unit_id,
          ":",
          e
        );
        await delay(5000);
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

const rpc = new ethers.JsonRpcProvider(config.test_rpc_url, undefined, { batchMaxCount: 1 });

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
  solution.hash = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
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

  await delay(2000);

  const sum = await proofs.get();
  const counts = sum.values.filter((v) => v.metricName === "proofs_count");
  for (const provider of config.providers) {
    const cu_ids = provider.peers.flatMap((peer) => peer.cu_ids);
    const provider_counts = counts.filter((c) => c.labels.provider === provider.name);
    console.log("Provider", provider.name);
    for (const cu_id of cu_ids) {
      const cu_counts = provider_counts.filter((c) => c.labels.cu_id === cu_id);
      const success = cu_counts.find((c) => c.labels.status === "success")?.value || 0;
      const error = cu_counts.find((c) => c.labels.status === "error")?.value || 0;
      console.log("\tCU", cu_id, "\tS", success, "\tE", error, "\tT", success + error);
    }
  }
}
