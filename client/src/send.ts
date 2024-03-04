import { ethers, type BytesLike } from "ethers";
import PQueue from "p-queue";
import {
  DealClient,
  type ICapacityInterface as Capacity,
} from "@fluencelabs/deal-ts-clients";

import { Communicate, type Solution } from "./communicate.js";
import { loadConfig, type PeerConfig } from "./config.js";
import { Metrics } from "./metrics.js";
import { hexMin } from "./utils.js";

import {
  CCP_RPC_URL,
  DEFAULT_CONFIRMATIONS,
  MAX_DIFFICULTY,
  BUFFER_PROOFS,
  CONFIG_FILE,
  METRICS_FILE,
  DEFAULT_ETH_API_URL,
  ETH_API_URL,
} from "./const.js";

// Peer sends proofs for CUs
class Peer {
  private readonly config: PeerConfig;
  private readonly capacity: Capacity;

  // concurrency: 1 so that we don't submit many proofs at the same time
  private readonly queue: PQueue = new PQueue({
    concurrency: 1,
    timeout: 60000, // 60s
    throwOnTimeout: true,
  });

  private not_started = false;

  private readonly metrics: Metrics;
  private readonly defaultLabels: { [key: string]: string };

  constructor(
    config: PeerConfig,
    capacity: Capacity,
    metrics: Metrics,
    defultLabels: { [key: string]: string } = {}
  ) {
    this.config = config;
    this.capacity = capacity;
    this.metrics = metrics;
    this.defaultLabels = defultLabels;
  }

  async init() {
    this.queue.on("idle", () => {
      // This could happen in the first epoch or at the beginning of a new epoch
      // But should not happen mid-epoch, otherwise lower difficulty for CCP
      console.warn("WARNING: Queue for peer", this.config.owner_sk, "is empty");
    });
  }

  clear() {
    this.not_started = false;
    this.queue.clear();
  }

  hasCU(cu_id: BytesLike): Boolean {
    return this.config.cu_ids.includes(cu_id);
  }

  is(id: string) {
    return this.config.owner_sk === id;
  }

  proofs(): number {
    return this.queue.size + this.queue.pending;
  }

  submitProof(solution: Solution) {
    if (!this.hasCU(solution.cu_id)) {
      throw new Error("Peer does not have CU ID: " + solution.cu_id);
    }

    // Don't submit more proofs in this epoch
    if (this.not_started) {
      return;
    }

    // Drop excess proofs
    if (this.queue.size >= BUFFER_PROOFS) {
      return;
    }

    this.queue
      .add(async () => {
        const labels = {
          ...this.defaultLabels,
          peer: this.config.owner_sk,
          cu_id: solution.cu_id.toString(),
        };

        const end = this.metrics.start(labels);
        try {
          const submitProofTx = await this.capacity.submitProof(
            solution.cu_id,
            solution.local_nonce,
            solution.result_hash
          );
          end({ status: "success" });
          // We should wait confirmations
          await submitProofTx.wait(DEFAULT_CONFIRMATIONS);
          end({ status: "confirmed" });
        } catch (e: any) {
          // Classify error
          const data = e?.info?.error?.data;
          const msg = data ? Buffer.from(data, "hex").toString() : undefined;
          let status = "error";
          if (msg?.includes("not valid")) {
            status = "invalid";
          } else if (msg?.includes("not started")) {
            this.not_started = true;
            status = "not_started";
          } else if (msg?.includes("not active")) {
            status = "not_active";
          } else {
            console.error("Error from `submitProof` for", solution, ":", e);
          }

          end({ status: status });
        }
      })
      .catch((e) => {
        console.error(
          "Error submitting (probably timeout) for",
          this.config.owner_sk,
          ":",
          e.message
        );
      });
  }
}

const config = loadConfig(CONFIG_FILE);

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

const metrics = new Metrics();

const peers: Peer[] = [];
for (const provider of config.providers) {
  for (const config of provider.peers) {
    const url = ETH_API_URL(peers.length + 1);
    const rpc = new ethers.JsonRpcProvider(url);
    const signer = new ethers.Wallet(config.owner_sk, rpc);
    const client = new DealClient(signer, "local");
    const capacity = await client.getCapacity();
    const peer = new Peer(config, capacity, metrics, {
      provider: provider.name,
      peer: config.owner_sk,
    });
    await peer.init();
    peers.push(peer);
  }
}

const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);
const client = new DealClient(rpc, "local");
const core = await client.getCore();
const capacity = await client.getCapacity();

let global_nonce = await capacity.getGlobalNonce();
const _difficulty = await capacity.difficulty();
const difficulty = hexMin(_difficulty, MAX_DIFFICULTY);

console.info("Initial difficulty: ", difficulty);
console.info("Initial global nonce: ", global_nonce);

const communicate = new Communicate(CCP_RPC_URL, 5000);

console.log("Requesting parameters...");

communicate.request({
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
    throw new Error("No peer for CU ID: " + solution.cu_id);
  }
});

let epoch = await core.currentEpoch();
rpc.on("block", async (_) => {
  const curEpoch = await core.currentEpoch();
  if (curEpoch > epoch) {
    epoch = curEpoch;

    const _global_nonce = await capacity.getGlobalNonce();
    const _difficulty = await capacity.difficulty();
    const difficulty = hexMin(_difficulty, MAX_DIFFICULTY);

    console.log("Epoch: ", epoch);
    console.log("Difficulty: ", difficulty);
    console.log("Global nonce: ", _global_nonce);

    if (_global_nonce !== global_nonce) {
      global_nonce = _global_nonce;
      console.log("Global nonce changed, requesting parameters...");

      communicate.request({
        global_nonce,
        difficulty,
        cu_allocation,
      });
    } else {
      console.log("Global nonce did not change");
    }

    for (const peer of peers) {
      peer.clear();
    }
  }
});

// Dump metrics every minute
setInterval(async () => {
  await metrics.dump(METRICS_FILE);
}, 60000);

const start = new Date().getTime();
async function logStats() {
  const now = new Date().getTime();
  console.log("Passed: ", (now - start) / 1000, "s");
  console.log(
    "Success requests:",
    metrics.filter({ status: "success" }).count()
  );
  for (const provider of config.providers) {
    console.log("Provider", provider.name);
    const providerMetrics = metrics.filter({ provider: provider.name });
    for (const peer of provider.peers) {
      const p = peers.find((p) => p.is(peer.owner_sk));
      console.log("\tPeer", peer.owner_sk, "\tProofs:", p!.proofs());
      const peerMetrics = providerMetrics.filter({ peer: peer.owner_sk });
      for (const cu_id of peer.cu_ids) {
        const cuMetrics = peerMetrics.filter({ cu_id: cu_id.toString() });
        const count_status = (s: string) =>
          cuMetrics.filter({ status: s }).count();
        const total = cuMetrics.count();
        const success = count_status("success");
        const confirmed = count_status("confirmed");
        const error = count_status("error");
        const invalid = count_status("invalid");
        const not_started = count_status("not_started");
        const not_active = count_status("not_active");
        console.log(
          "\t\tCU",
          cu_id,
          "\tS",
          success,
          "\tC",
          confirmed,
          "\tI",
          invalid,
          "\tNS",
          not_started,
          "\tNA",
          not_active,
          "\tE",
          error,
          "\tT",
          total
        );
      }
    }
  }
}

setInterval(logStats, 30000);
