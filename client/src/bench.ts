import { ethers, type BytesLike } from "ethers";
import { DealClient } from "@fluencelabs/deal-ts-clients";
import type { AddressLike } from "ethers";

import {
  type ProviderConfig,
  type Config,
  readConfig,
  writeConfig,
} from "./config.js";
import {
  CCP_RPC_URL,
  MAX_DIFFICULTY,
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
import { logStats } from "./log.js";

process.on("unhandledRejection", (reason, promise) => {
  console.log("ERROR: Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.log("ERROR: Uncaught Exception:", err);
});

async function transfer(
  signer: ethers.Wallet,
  to: AddressLike,
  amount: string
) {
  const tx = await signer.sendTransaction({
    to: to,
    value: ethers.parseEther(amount),
  });
  await tx.wait(DEFAULT_CONFIRMATIONS);
}

async function initNewProviders(
  signer: ethers.Wallet,
  config: Config,
  cuPerPeer: number,
  total: number
) {
  for (let i = config.providers.length; i < total; i++) {
    const name = `PV${i}`;

    console.log(`Preparing ${name}...`);

    const providerW = ethers.Wallet.createRandom();
    const peerW = ethers.Wallet.createRandom();

    console.log("Transfering funds to provider wallet...");
    await transfer(signer, providerW.address, "40");

    console.log("Transfering funds to peer wallet...");
    await transfer(signer, peerW.address, "400");

    const providerConfig: ProviderConfig = {
      name,
      sk: providerW.privateKey,
      peers: [
        {
          cu_count: cuPerPeer,
          owner_sk: peerW.privateKey,
          cu_ids: [], // Will be filled on registration
        },
      ],
    };

    config.providers.push(providerConfig);
  }
}

async function prepareFunds(
  signer: ethers.Wallet,
  rpc: ethers.JsonRpcProvider,
  providers: ProviderConfig[]
) {
  for (const provider of providers) {
    const provW = new ethers.Wallet(provider.sk, rpc);
    const peerW = new ethers.Wallet(provider.peers[0]!.owner_sk, rpc);

    const provBalance = await rpc.getBalance(provW.address);
    const peerBalance = await rpc.getBalance(peerW.address);
    console.log("Provider:", provider.name);
    console.log("Provider balance:", ethers.formatEther(provBalance));
    console.log("Peer balance:", ethers.formatEther(peerBalance));

    if (provBalance < ethers.parseEther("30")) {
      console.log("Not enough funds for provider, trying to add...");
      await transfer(signer, provW.address, "40");

      const provBalance = await rpc.getBalance(provW.address);
      console.log("Provider balance:", ethers.formatEther(provBalance));
    }

    if (peerBalance < ethers.parseEther("300")) {
      console.log("Not enough funds for peer, trying to add...");
      await transfer(signer, peerW.address, "400");

      const peerBalance = await rpc.getBalance(peerW.address);
      console.log("Peer balance:", ethers.formatEther(peerBalance));
    }
  }
}

async function initPeers(
  providers: ProviderConfig[],
  batchSize: number,
  metrics: Metrics,
  epoch: number
): Promise<Peer[]> {
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
      const capacity = client.getCapacity();
      const core = client.getCore();
      const defLabels = {
        provider: provider.name,
        peer: config.owner_sk,
      };
      const peer = new Peer(
        config,
        capacity,
        core,
        peerRpc,
        batchSize,
        metrics,
        defLabels
      );
      await peer.init(epoch);
      peers.push(peer);
    }
  }

  return peers;
}

export async function bench(
  forEpoches: number,
  providersNum: number,
  cuPerPeer: number,
  batchSize: number,
  metricsPath: string
) {
  const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);
  await rpc.on("error", (e) => {
    console.log("WARNING: RPC error:", e);
  });

  const signer = new ethers.Wallet(PRIVATE_KEY, rpc);

  const client = new DealClient(rpc, "local");
  const core = client.getCore();
  let epoch = await core.currentEpoch();
  const chainDifficulty = await core.difficulty();
  const capacity = client.getCapacity();

  let globalNonce = await capacity.getGlobalNonce();
  const difficulty = hexMin(chainDifficulty, MAX_DIFFICULTY);

  let config: Config = { providers: [] };

  try {
    config = readConfig(PROVIDERS_PATH);
  } catch (e) {
    if (e instanceof Error) {
      console.log(`Failed to read ${PROVIDERS_PATH}:`, e.message);
    }
  }

  console.log("Will initialize new providers...");
  await initNewProviders(signer, config, cuPerPeer, providersNum);
  console.log("Initialized new providers...");

  // Update cu count according to constants
  for (const provider of config.providers) {
    for (const peer of provider.peers) {
      peer.cu_count = cuPerPeer;
    }
  }

  console.log("Will update config...");
  writeConfig(config, PROVIDERS_PATH);
  console.log("Updated config...");

  const providers = config.providers.slice(0, providersNum);

  console.log("Will prepare all providers...");
  await prepareFunds(signer, rpc, providers);
  console.log("Prepared all providers:", JSON.stringify(config));

  console.log("Will register all providers...");

  await Promise.all(
    providers.map(async (provider) => {
      for (let attempt = 0; attempt < 10; attempt++) {
        console.log(
          "Attempt to register provider",
          provider.name,
          ":",
          attempt
        );
        try {
          await Promise.race([
            registerProvider(rpc, provider),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(), 180000)
            ),
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

  console.log("Will initialize all peers...");
  const peers: Peer[] = await initPeers(
    providers,
    batchSize,
    metrics,
    Number(epoch)
  );
  console.log("Initialized all peers...");

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
      peer.submitSolution(solution);
    } else {
      throw new Error("No peer for CU ID: " + solution.cu_id);
    }
  });

  let stopSignal: () => void = () => {};
  const stopPromise = new Promise<void>((resolve) => {
    stopSignal = resolve;
  });
  let passedEpoches = 0;
  await rpc.on("block", (_) => {
    (async () => {
      const curEpoch = await core.currentEpoch();
      if (curEpoch <= epoch) {
        return;
      }

      epoch = curEpoch;
      passedEpoches += 1;

      if (passedEpoches > forEpoches) {
        stopSignal();
        return;
      }

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
    })().catch((e) => {
      console.error("WARNING: Failed to process block:", e);
    });
  });

  // Dump metrics
  const metricsInterval = setInterval(() => {
    metrics.dump(metricsPath).catch((e) => {
      console.log("WARNING: Failed to dump metrics:", e);
    });
  }, 10000);

  let prevProofsCount = proofsCount;
  const start = new Date().getTime();
  const logInterval = setInterval(() => {
    const elapsed = new Date().getTime() - start;
    const newProofs = proofsCount - prevProofsCount;
    prevProofsCount = proofsCount;
    logStats(metrics, providers, peers, elapsed, passedEpoches, newProofs);
  }, 30000);

  await stopPromise;

  console.log("Cleaning up...");
  clearInterval(metricsInterval);
  clearInterval(logInterval);
  await communicate.destroy();
  await rpc.removeAllListeners();
  rpc.destroy();
  await Promise.all(peers.map((peer) => peer.destroy()));
  console.log("Done, dumped metrics to", metricsPath);

  metrics.dump(metricsPath).catch((e) => {
    console.log("WARNING: Failed to dump metrics:", e);
  });
}
