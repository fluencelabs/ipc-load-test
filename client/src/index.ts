import { ethers, type BytesLike } from "ethers";
import { DealClient } from "@fluencelabs/deal-ts-clients";

import {
  type ProviderConfig,
  type Config,
  readConfig,
  writeConfig,
} from "./config.js";
import {
  METRICS_PATH,
  CCP_RPC_URL,
  MAX_DIFFICULTY,
  PROVIDERS_NUM,
  DEFAULT_ETH_API_URL,
  PRIVATE_KEY,
  DEFAULT_CONFIRMATIONS,
  ETH_API_URL,
  PROVIDERS_PATH,
} from "./const.js";
import { registerProvider } from "./register.js";
import { Communicate, type Solution } from "./communicate.js";
import { Peer } from "./peer.js";
import { Metrics } from "./metrics.js";
import { hexMin } from "./utils.js";

process.on("unhandledRejection", (reason, promise) => {
  console.log("ERROR: Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.log("ERROR: Uncaught Exception:", err);
});

const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);
rpc.on("error", (e) => {
  console.log("WARNING: RPC error:", e);
});

const signer = new ethers.Wallet(PRIVATE_KEY, rpc);

const client = new DealClient(rpc, "local");
const core = await client.getCore();
let epoch = await core.currentEpoch();
const capacity = await client.getCapacity();

let global_nonce = await capacity.getGlobalNonce();
const _difficulty = await capacity.difficulty();
const difficulty = hexMin(_difficulty, MAX_DIFFICULTY);

let config: Config = { providers: [] };

try {
  config = readConfig(PROVIDERS_PATH);
} catch (e) {
  console.log(`Failed to read ${PROVIDERS_PATH}:`, e);
  console.log("Will initialize new providers...");

  for (let i = 0; i < PROVIDERS_NUM; i++) {
    const name = `PV${i}`;

    console.log(`Preparing ${name}...`);

    const providerW = ethers.Wallet.createRandom();
    const peerW = ethers.Wallet.createRandom();

    console.log("Transfering funds to provider wallet...");
    const providerTx = await signer.sendTransaction({
      to: providerW.address,
      value: ethers.parseEther("40"),
    });
    await providerTx.wait(DEFAULT_CONFIRMATIONS);

    console.log("Transfering funds to peer wallet...");
    const peerTx = await signer.sendTransaction({
      to: peerW.address,
      value: ethers.parseEther("40"),
    });
    await peerTx.wait(DEFAULT_CONFIRMATIONS);

    const providerConfig: ProviderConfig = {
      name,
      sk: providerW.privateKey,
      peers: [
        {
          cu_count: 1,
          owner_sk: peerW.privateKey,
          cu_ids: [], // Will be filled on registration
        },
      ],
    };

    config.providers.push(providerConfig);
  }

  writeConfig(config, PROVIDERS_PATH);
}

const providers = config.providers;

for (const provider of providers) {
  const provW = new ethers.Wallet(provider.sk, rpc);
  const peerW = new ethers.Wallet(provider.peers[0]!.owner_sk, rpc);

  const provBalance = await rpc.getBalance(provW.address);
  const peerBalance = await rpc.getBalance(peerW.address);
  console.log("Provider:", provider.name);
  console.log("Provider balance:", ethers.formatEther(provBalance));
  console.log("Peer balance:", ethers.formatEther(peerBalance));

  if (
    provBalance < ethers.parseEther("20") ||
    peerBalance < ethers.parseEther("20")
  ) {
    throw new Error("Insufficient funds for provider or peer");
  }
}

console.log("Prepared all providers:", JSON.stringify(config));

await Promise.all(
  providers.map(async (provider) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      console.log("Attempt to register provider", provider.name, ":", attempt);
      try {
        await Promise.race([
          registerProvider(rpc, provider),
          new Promise<void>((_, reject) => setTimeout(() => reject(), 60000)),
        ]);
      } catch (e) {
        console.error("Failed to register provider", provider.name, ":", e);
        continue;
      }
      break;
    }
  })
);

console.log("Registered all providers...");

const metrics = new Metrics();
const peers: Peer[] = [];

for (const provider of providers) {
  for (const config of provider.peers) {
    const url = ETH_API_URL(peers.length + 1);
    const peerRpc = new ethers.JsonRpcProvider(url);
    peerRpc.on("error", (e) => {
      console.log("WARNING: Peer", config.owner_sk, "RPC error:", e);
    });
    const signer = new ethers.Wallet(config.owner_sk, peerRpc);
    const client = new DealClient(signer, "local");
    const capacity = await client.getCapacity();
    const peer = new Peer(config, capacity, metrics, {
      provider: provider.name,
      peer: config.owner_sk,
    });
    await peer.init(Number(epoch));
    peers.push(peer);
  }
}

const allCUIds = providers.flatMap((provider) =>
  provider.peers.flatMap((peer) => peer.cu_ids)
);

const cu_allocation = allCUIds.reduce(
  (acc, cu_id, idx) => {
    acc[10 + idx] = cu_id;
    return acc;
  },
  {} as Record<number, BytesLike>
);

const communicate = new Communicate(CCP_RPC_URL, 5000);

console.info("Initial difficulty: ", difficulty);
console.info("Initial global nonce: ", global_nonce);

console.log("Requesting parameters...");

communicate.request({
  global_nonce,
  difficulty,
  cu_allocation,
});

console.log("Waiting for solution...");

let proofsCount = 0;
communicate.on("solution", async (solution: Solution) => {
  const peer = peers.find((p) => p.hasCU(solution.cu_id));
  if (peer) {
    proofsCount += 1;
    peer.submitSolution(solution);
  } else {
    throw new Error("No peer for CU ID: " + solution.cu_id);
  }
});

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

    // TODO: Do not clear of gnonce did not change?
    for (const peer of peers) {
      peer.clear(Number(epoch));
    }
  }
});

// Dump metrics every minute
setInterval(async () => {
  await metrics.dump(METRICS_PATH);
}, 60000);

let prevProofsCount = proofsCount;
const start = new Date().getTime();
async function logStats() {
  const now = new Date().getTime();
  console.log("Passed: ", (now - start) / 1000, "s");

  console.log(
    "Success requests:",
    metrics.filter({ status: "success" }).count()
  );

  console.log("Proofs since last log:", proofsCount - prevProofsCount);
  prevProofsCount = proofsCount;

  for (const provider of providers) {
    console.log("Provider", provider.name);
    const providerMetrics = metrics.filter({ provider: provider.name });
    for (const peer of provider.peers) {
      const p = peers.find((p) => p.is(peer.owner_sk));
      console.log(
        "\tPeer",
        peer.owner_sk,
        "\tProofs:",
        p!.proofs(),
        "\tBatches:",
        p!.batches()
      );
      const peerMetrics = providerMetrics.filter({ peer: peer.owner_sk });
      for (const cu_id of peer.cu_ids) {
        const cuMetrics = peerMetrics.filter({ cu_id: cu_id.toString() });
        const count_status_requests = (s: string) =>
          cuMetrics.filter({ status: s }).count();
        const success = count_status_requests("success");
        const confirmed = count_status_requests("confirmed");
        const error = count_status_requests("error");
        const invalid = count_status_requests("invalid");
        const not_started = count_status_requests("not_started");
        const not_active = count_status_requests("not_active");
        const total = success + error + invalid + not_started + not_active;
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
