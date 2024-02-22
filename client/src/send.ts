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
} from "./const.js";

// Peer sends proofs for CUs
class Peer {
  private readonly config: PeerConfig;
  private readonly signer: ethers.Wallet;

  private capacity: Capacity | undefined;
  private nonce: number | undefined;

  // concurrency: 1 so that we don't submit many proofs at the same time
  private readonly queue: PQueue = new PQueue({ concurrency: 1 });

  private not_started = false;

  private readonly metrics: Metrics;
  private readonly defaultLabels: { [key: string]: string };

  constructor(
    config: PeerConfig,
    rpc: ethers.JsonRpcProvider,
    metrics: Metrics,
    defultLabels: { [key: string]: string } = {}
  ) {
    this.config = config;
    this.signer = new ethers.Wallet(this.config.owner_sk, rpc);
    this.metrics = metrics;
    this.defaultLabels = defultLabels;
  }

  async init() {
    this.queue.on("idle", () => {
      // This could happen in the first epoch or at the beginning of a new epoch
      // But should not happen mid-epoch, otherwise lower difficulty for CCP
      console.warn("WARNING: Queue for peer", this.config.owner_sk, "is empty");
    });

    this.nonce = await this.signer.getNonce();
    const client = new DealClient(this.signer, "local");
    this.capacity = await client.getCapacity();
  }

  clear() {
    this.not_started = false;
    this.queue.clear();
  }

  hasCU(cu_id: BytesLike): Boolean {
    return this.config.cu_ids.includes(cu_id);
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

    this.queue.add(async () => {
      const labels = {
        ...this.defaultLabels,
        peer: this.config.owner_sk,
        cu_id: solution.cu_id.toString(),
      };

      const end = this.metrics.start(labels);
      try {
        const submitProofTx =
          await this.capacity.submitProof.populateTransaction(
            solution.cu_id,
            solution.local_nonce,
            solution.result_hash
          );
        submitProofTx.nonce = this.nonce;
        await this.signer.sendTransaction(submitProofTx);
        this.nonce = this.nonce! + 1;
        // We should not wait confirmations?
        // await submitProofTx.wait(DEFAULT_CONFIRMATIONS);
        end({ status: "success" });
      } catch (e: any) {
        this.nonce = await this.signer.getNonce();

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
const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);

const peers: Peer[] = [];
for (const provider of config.providers) {
  for (const config of provider.peers) {
    const peer = new Peer(config, rpc, metrics, {
      provider: provider.name,
      peer: config.owner_sk,
    });
    await peer.init();
    peers.push(peer);
  }
}

const client = new DealClient(rpc, "local");
const core = await client.getCore();
const capacity = await client.getCapacity();

const global_nonce = await capacity.getGlobalNonce();
const _difficulty = await capacity.difficulty();
const difficulty = hexMin(_difficulty, MAX_DIFFICULTY);

console.info("Initial difficulty: ", difficulty);
console.info("Initial global nonce: ", global_nonce);

const communicate = new Communicate(CCP_RPC_URL);

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

    const global_nonce = await capacity.getGlobalNonce();
    const _difficulty = await capacity.difficulty();
    const difficulty = hexMin(_difficulty, MAX_DIFFICULTY);

    console.log("Epoch: ", epoch);
    console.log("Difficulty: ", difficulty);
    console.log("Global nonce: ", global_nonce);
    console.log("Requesting parameters...");

    communicate.request({
      global_nonce,
      difficulty,
      cu_allocation,
    });

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
      console.log("\tPeer", peer.owner_sk);
      const peerMetrics = providerMetrics.filter({ peer: peer.owner_sk });
      for (const cu_id of peer.cu_ids) {
        const cuMetrics = peerMetrics.filter({ cu_id: cu_id.toString() });
        const count_status = (s: string) =>
          cuMetrics.filter({ status: s }).count();
        const total = cuMetrics.count();
        const success = count_status("success");
        const error = count_status("error");
        const invalid = count_status("invalid");
        const not_started = count_status("not_started");
        const not_active = count_status("not_active");
        console.log(
          "\t\tCU",
          cu_id,
          "\tS",
          success,
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
