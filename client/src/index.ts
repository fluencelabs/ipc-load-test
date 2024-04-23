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
import type { AddressLike } from "ethers";

process.on("unhandledRejection", (reason, promise) => {
  console.log("ERROR: Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.log("ERROR: Uncaught Exception:", err);
});

const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);
await rpc.on("error", (e) => {
  console.log("WARNING: RPC error:", e);
});

const signer = new ethers.Wallet(PRIVATE_KEY, rpc);

const client = new DealClient(rpc, "local");
const core = await client.getCore();
let epoch = await core.currentEpoch();
const chainDifficulty = await core.difficulty();
const capacity = await client.getCapacity();

let globalNonce = await capacity.getGlobalNonce();
const difficulty = hexMin(chainDifficulty, MAX_DIFFICULTY);

let config: Config = { providers: [] };

async function transfer(to: AddressLike, amount: string) {
  const tx = await signer.sendTransaction({
    to: to,
    value: ethers.parseEther(amount),
  });
  await tx.wait(DEFAULT_CONFIRMATIONS);
}

try {
  config = readConfig(PROVIDERS_PATH);
} catch (e) {
  if (e instanceof Error) {
    console.log(`Failed to read ${PROVIDERS_PATH}:`, e.message);
  }
}

console.log("Will initialize new providers...");

for (let i = config.providers.length; i < PROVIDERS_NUM; i++) {
  const name = `PV${i}`;

  console.log(`Preparing ${name}...`);

  const providerW = ethers.Wallet.createRandom();
  const peerW = ethers.Wallet.createRandom();

  console.log("Transfering funds to provider wallet...");
  await transfer(providerW.address, "40");

  console.log("Transfering funds to peer wallet...");
  await transfer(peerW.address, "400");

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

const providers = config.providers.slice(0, PROVIDERS_NUM);

for (const provider of providers) {
  const provW = new ethers.Wallet(provider.sk, rpc);
  const peerW = new ethers.Wallet(provider.peers[0]!.owner_sk, rpc);

  const provBalance = await rpc.getBalance(provW.address);
  const peerBalance = await rpc.getBalance(peerW.address);
  console.log("Provider:", provider.name);
  console.log("Provider balance:", ethers.formatEther(provBalance));
  console.log("Peer balance:", ethers.formatEther(peerBalance));

  if (provBalance < ethers.parseEther("10")) {
    console.log("Not enough funds for provider, trying to add...");
    await transfer(provW.address, "10");

    const provBalance = await rpc.getBalance(provW.address);
    console.log("Provider balance:", ethers.formatEther(provBalance));
  }

  if (peerBalance < ethers.parseEther("200")) {
    console.log("Not enough funds for peer, trying to add...");
    await transfer(peerW.address, "400");

    const peerBalance = await rpc.getBalance(peerW.address);
    console.log("Peer balance:", ethers.formatEther(peerBalance));
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
          new Promise<void>((_, reject) => setTimeout(() => reject(), 180000)),
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
    await peerRpc.on("error", (e) => {
      console.log("WARNING: Peer", config.owner_sk, "RPC error:", e);
    });
    const signer = new ethers.Wallet(config.owner_sk, peerRpc);
    const client = new DealClient(signer, "local");
    const capacity = await client.getCapacity();
    const core = await client.getCore();
    const defLabels = {
      provider: provider.name,
      peer: config.owner_sk,
    };
    const peer = new Peer(config, capacity, core, peerRpc, metrics, defLabels);
    await peer.init(Number(epoch));
    peers.push(peer);
  }
}

const allCUIds = providers.flatMap((provider) =>
  provider.peers.flatMap((peer) => peer.cu_ids)
);

const cu_allocation = allCUIds.reduce(
  (acc, cu_id, idx) => {
    acc[4 + idx] = cu_id;
    return acc;
  },
  {} as Record<number, BytesLike>
);

const communicate = new Communicate(CCP_RPC_URL, 5000);

console.info("Initial difficulty: ", difficulty);
console.info("Initial global nonce: ", globalNonce);

console.log("Requesting parameters...");

await communicate.request({
  global_nonce: globalNonce,
  difficulty,
  cu_allocation,
});

console.log("Waiting for solution...");

let proofsCount = 0;
communicate.on("solution", (solution: Solution) => {
  const peer = peers.find((p) => p.hasCU(solution.cu_id));
  if (peer) {
    proofsCount += 1;
    peer.submitSolution(solution, globalNonce);
  } else {
    throw new Error("No peer for CU ID: " + solution.cu_id);
  }
});

await rpc.on("block", (_) => {
  (async () => {
    const curEpoch = await core.currentEpoch();
    if (curEpoch > epoch) {
      epoch = curEpoch;

      const chainGlobalNonce = await capacity.getGlobalNonce();
      const chainDifficulty = await core.difficulty();
      const difficulty = hexMin(chainDifficulty, MAX_DIFFICULTY);

      console.log("Epoch: ", epoch);
      console.log("Difficulty: ", difficulty);
      console.log("Global nonce: ", chainGlobalNonce);

      if (chainGlobalNonce !== globalNonce) {
        globalNonce = chainGlobalNonce;
        console.log("Global nonce changed, requesting parameters...");

        await communicate.request({
          global_nonce: globalNonce,
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
  })().catch((e) => {
    console.error("WARNING: Failed to process block:", e);
  });
});

// Dump metrics every minute
setInterval(() => {
  metrics.dump(METRICS_PATH).catch((e) => {
    console.log("WARNING: Failed to dump metrics:", e);
  });
}, 60000);

let prevProofsCount = proofsCount;
const start = new Date().getTime();
function logStats() {
  const now = new Date().getTime();
  console.log("Passed: ", (now - start) / 1000, "s");

  console.log(
    "Success requests:",
    metrics.filter({ status: "success", action: "send" }).count()
  );

  console.log("Proofs since last log:", proofsCount - prevProofsCount);
  prevProofsCount = proofsCount;

  for (const provider of providers) {
    console.log("Provider", provider.name);
    const providerMetrics = metrics.filter({ provider: provider.name });
    for (const peer of provider.peers) {
      const p = peers.find((p) => p.is(peer.owner_sk));
      const pBlock = p?.getBlock();
      const pEpoch = p?.getEpoch();
      console.log(
        "\tPeer",
        peer.owner_sk,
        "\tProofs:",
        p!.proofs(),
        "\tBatches:",
        p!.batches(),
        "\tEpoch:",
        pEpoch,
        "\tBlock:",
        pBlock
      );
      const peerMetrics = providerMetrics.filter({ peer: peer.owner_sk });
      for (const cu_id of peer.cu_ids) {
        const cuMetrics = peerMetrics.filter({ cu_id: cu_id.toString() });
        const count = (s: string) => cuMetrics.filter({ status: s }).count();
        const count_est = (s: string) =>
          cuMetrics.filter({ status: s, action: "estimate" }).count();
        const count_send = (s: string) =>
          cuMetrics.filter({ status: s, action: "send" }).count();
        const success_est = count_est("success");
        const success_send = count_send("success");
        const confirmed = count("confirmed");
        const error_est = count_est("error");
        const error_send = count_send("error");
        const invalid = count_est("invalid");
        const not_started = count_est("not_started");
        const not_active = count_est("not_active");
        const total =
          success_est + error_est + invalid + not_started + not_active;
        console.log(
          "\t\tCU",
          cu_id,
          "\tS",
          `${success_est}|${success_send}`,
          "\tC",
          confirmed,
          "\tI",
          invalid,
          "\tNS",
          not_started,
          "\tNA",
          not_active,
          "\tE",
          `${error_est}|${error_send}`,
          "\tT",
          total
        );
      }
    }
  }
}

setInterval(logStats, 10000);
