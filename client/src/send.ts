import { ethers, type BytesLike } from "ethers";
import * as prom from "prom-client";
import PQueue from "p-queue";
import {
  DealClient,
  type ICapacityInterface as Capacity,
} from "@fluencelabs/deal-ts-clients";

import { Communicate, type Solution } from "./communicate.js";
import { loadConfig, type PeerConfig } from "./config.js";

const DEFAULT_CONFIRMATIONS = 1;
const BUFFER_PROOFS = 10;

class Peer {
  private readonly config: PeerConfig;
  private readonly capacity: Capacity;

  private readonly queue: PQueue;

  private readonly summary: prom.Summary;
  private readonly defaultLabels: { [key: string]: string };

  constructor(
    config: PeerConfig,
    capacity: Capacity,
    summary: prom.Summary,
    defultLabels: { [key: string]: string } = {}
  ) {
    this.config = config;
    this.capacity = capacity;

    this.queue = new PQueue({ concurrency: 1 });

    this.summary = summary;
    this.defaultLabels = defultLabels;
  }

  clear() {
    this.queue.clear();
  }

  hasCU(cu_id: BytesLike): Boolean {
    return this.config.cu_ids.includes(cu_id);
  }

  submitProof(solution: Solution) {
    if (!this.hasCU(solution.cu_id)) {
      throw new Error("Peer does not have CU ID: " + solution.cu_id);
    }

    if (this.queue.size >= BUFFER_PROOFS) {
      return;
    }

    this.queue.add(async () => {
      const labels = {
        ...this.defaultLabels,
        peer: this.config.owner_sk,
        cu_id: solution.cu_id.toString(),
      };

      const end = this.summary.startTimer(labels);
      try {
        const submitProofTx = await this.capacity.submitProof(
          solution.cu_id,
          solution.local_nonce,
          solution.result_hash
        );
        await submitProofTx.wait(DEFAULT_CONFIRMATIONS);
        end({ status: "success" });
      } catch (e: any) {
        const data = e?.info?.error?.data;
        const msg = data ? Buffer.from(data, "hex").toString() : "No message";
        let status = "error";
        if (msg.includes("not valid")) {
          status = "invalid";
        } else if (msg.includes("not started")) {
          status = "not_started";
        } else {
          console.error("Error from `submitProof` for", solution, ":", e);
        }

        end({ status: status });
      }
    });
  }
}

const config = loadConfig("config.json");

const allCUIds = config.providers.flatMap((provider) =>
  provider.peers.flatMap((peer) => peer.cu_ids)
);

if (allCUIds.length === 0) {
  throw new Error("No CUs configured");
}

const cu_allocation = allCUIds.reduce(
  (acc, cu_id, idx) => {
    acc[10 + idx] = cu_id;
    return acc;
  },
  {} as Record<number, BytesLike>
);

const registry = new prom.Registry();
const proofs = new prom.Summary({
  name: "proofs",
  help: "Proofs summary",
  registers: [registry],
  labelNames: ["provider", "peer", "cu_id", "status"],
});

const rpc = new ethers.JsonRpcProvider(config.test_rpc_url);

const peers: Peer[] = [];
for (const provider of config.providers) {
  for (const peer of provider.peers) {
    const signer = new ethers.Wallet(peer.owner_sk, rpc);
    const client = new DealClient(signer, "local");
    const capacity = await client.getCapacity();
    peers.push(
      new Peer(peer, capacity, proofs, {
        provider: provider.name,
        peer: peer.owner_sk,
      })
    );
  }
}

const client = new DealClient(rpc, "local");
const core = await client.getCore();
const capacity = await client.getCapacity();

const global_nonce = await capacity.getGlobalNonce();
const difficulty = await capacity.difficulty();

console.info("Initial difficulty: ", difficulty);
console.info("Initial global nonce: ", global_nonce);

const communicate = new Communicate("http://127.0.0.1:9383");

console.log("Requesting parameters...");

await communicate.request({
  global_nonce,
  difficulty,
  cu_allocation,
});

console.log("Waiting for solution...");

communicate.on("solution", async (solution: Solution) => {
  const peer = peers.find((p) => p.hasCU(solution.cu_id));
  if (peer) {
    peer.submitProof(solution);
  } else {
    throw new Error("No provider for CU ID: " + solution.cu_id);
  }
});

let epoch = await core.currentEpoch();
rpc.on("block", async (_) => {
  const curEpoch = await core.currentEpoch();
  if (curEpoch > epoch) {
    epoch = curEpoch;

    const global_nonce = await capacity.getGlobalNonce();
    const difficulty = await capacity.difficulty();

    console.log("Epoch: ", epoch);
    console.log("Difficulty: ", difficulty);
    console.log("Global nonce: ", global_nonce);
    console.log("Requesting parameters...");

    communicate.request({ global_nonce, difficulty, cu_allocation });

    for (const peer of peers) {
      peer.clear();
    }
  }
});

async function logStats() {
  const sum = await proofs.get();
  const counts = sum.values.filter((v) => v.metricName === "proofs_count");
  for (const provider of config.providers) {
    const provider_counts = counts.filter(
      (c) => c.labels.provider === provider.name
    );
    console.log("Provider", provider.name);
    for (const peer of provider.peers) {
      const peer_counts = provider_counts.filter(
        (c) => c.labels.peer === peer.owner_sk
      );
      console.log("\tPeer", peer.owner_sk);
      for (const cu_id of peer.cu_ids) {
        const cu_counts = peer_counts.filter((c) => c.labels.cu_id === cu_id);
        const count_status = (s: string) =>
          cu_counts.find((c) => c.labels.status === s)?.value || 0;
        const total = cu_counts.reduce((acc, c) => acc + c.value, 0);
        const success = count_status("success");
        const error = count_status("error");
        const invalid = count_status("invalid");
        const not_started = count_status("not_started");
        console.log(
          "\t\tCU",
          cu_id,
          "\tS",
          success,
          "\tI",
          invalid,
          "\tNS",
          not_started,
          "\tE",
          error,
          "\tT",
          total
        );
      }
    }
  }
}

setInterval(logStats, 10000);
