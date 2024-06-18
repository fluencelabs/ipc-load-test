import { ethers, type BytesLike, type AddressLike } from "ethers";

import {
  DEFAULT_ETH_API_URL,
  PRIVATE_KEY,
  DEFAULT_CONFIRMATIONS,
  ETH_API_URL,
  CHAIN_GNONCE_HARDCODED,
  CCP_DIFFICULTY,
  BUFFER_BATCHES,
  idToNodeId,
} from "./const.js";
import { Proofs } from "./proofs.js";
import { Metrics } from "./metrics.js";
import {
  Balancer,
  makeSignal,
  count,
  ProofSet,
  setDiff,
  collapseIntervals,
} from "./utils.js";
import { Sender } from "./sender.js";
import { readConfig, writeConfig } from "./config.js";

process.on("unhandledRejection", (reason, promise) => {
  console.log("ERROR: Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.log("ERROR: Uncaught Exception:", err);
});

async function transfer(
  signer: ethers.Signer,
  to: AddressLike,
  amount: number
) {
  console.log("Transferring", amount, "ETH to", to);
  const nonce = await signer.getNonce();
  while (true) {
    try {
      const tx = await signer.sendTransaction({
        to: to,
        value: ethers.parseEther(amount.toString()),
        nonce: nonce,
      });
      await tx.wait(DEFAULT_CONFIRMATIONS);
    } catch (e) {
      console.log("WARNING: Failed to transfer:", (e as Error).message, ". Retrying...");

      continue;
    }

    break;
  }
}

async function genPKeys(n: number, signer: ethers.Signer, balance: number): Promise<string[]> {
  if (n <= 4) {
    const pkeys: string[] = [];

    for (let i = 0; i < n; i++) {
      const wallet = ethers.Wallet.createRandom();
      await transfer(signer, wallet.address, balance);
      pkeys.push(wallet.privateKey);
    }

    return pkeys;
  }

  const lw = ethers.Wallet.createRandom().connect(signer.provider);
  const rw = ethers.Wallet.createRandom().connect(signer.provider);

  const ln = Math.floor(n / 2);
  const rn = n - ln;

  await transfer(signer, lw.address, balance * ln);
  await transfer(signer, rw.address, balance * rn);

  const [lr, rr] = await Promise.all([genPKeys(ln - 1, lw, balance), genPKeys(rn - 1, rw, balance)]);

  return [lw.privateKey, rw.privateKey, ...lr, ...rr];
}

export type BenchParams = {
  interval: number;
  cusNumber: number;
  sendersNumber: number;
  proofsPerCu: number;
  batchesToSend: number;
  configPath: string;
  metricsPath: string;
};

export async function bench({
  interval,
  cusNumber,
  sendersNumber,
  proofsPerCu,
  batchesToSend,
  configPath,
  metricsPath,
}: BenchParams) {
  const config = (() => {
    try {
      return readConfig(configPath);
    } catch (e) {
      console.log("WARNING: Cannot read config:", (e as Error).message);
      return {
        private_keys: [],
      };
    }
  })();

  const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);
  await rpc.on("error", (e) => {
    console.log("WARNING: RPC error:", e);
  });
  const signer = new ethers.Wallet(PRIVATE_KEY, rpc);

  if (config.private_keys.length < sendersNumber) {
    console.log("Initializing new private keys...");
    const newPKeys = await genPKeys(sendersNumber - config.private_keys.length, signer, 400);
    config.private_keys.push(...newPKeys);
  }

  writeConfig(configPath, config);

  const pkeys = config.private_keys.slice(0, sendersNumber);

  const metrics = new Metrics();

  console.log("Funding senders...");

  await Promise.all(pkeys.map(async (pkey) => {
    const address = ethers.computeAddress(pkey);

    console.log("Getting balance of", address);

    const balance = await rpc.getBalance(address);

    console.log("Balance of", address, ":", ethers.formatEther(balance));

    if (balance < ethers.parseEther("300")) {
      await transfer(signer, address, 400);
    }
  }));

  console.log("Initializing senders...");

  const rpcs: Record<number, ethers.JsonRpcProvider> = {};
  const senders: Sender[] = await Promise.all(
    pkeys.map(async (key, idx) => {
      const nodeId = idToNodeId(idx);
      if (rpcs[nodeId] === undefined) {
        console.log("Initializing RPC to node", nodeId);
        const nodeRpc = new ethers.JsonRpcProvider(ETH_API_URL(idx));
        rpcs[nodeId] = nodeRpc;
        await nodeRpc.on("error", (e) => {
          console.log("WARNING: Node", nodeId, "RPC error:", e);
        });
        console.log("RPC to node", nodeId, "initialized");
      }

      const senderSigner = new ethers.Wallet(key, rpcs[nodeId]!);
      console.log("Initializing sender", idx);
      const sender = await Sender.create(idx, senderSigner, metrics);
      console.log("Sender", idx, "initialized");
      return sender;
    })
  );

  // We don't need it anymore
  await rpc.removeAllListeners();
  rpc.destroy();

  const senderBalancer = new Balancer(senders);

  const timestamp = Date.now();
  const cu_allocation: Record<number, BytesLike> = {};
  for (let i = 0; i < cusNumber; i++) {
    cu_allocation[i + 4] = ethers.encodeBytes32String(
      "cu-" + i.toString() + "-" + timestamp.toString()
    );
  }

  const proofs = new Proofs(cusNumber, proofsPerCu);

  const [stopSignal, stopPromise] = makeSignal();

  const batchesPending: Set<number> = new Set();
  const batchesSent: Set<number> = new Set();

  console.log("Starting benchmark...");

  const sendInterval = setInterval(() => {
    const batch = proofs.batch();
    (async () => {
      // This is the first batch
      if (batchesPending.size === 0) {
        metrics.shot({ action: "start-load", timestamp: Date.now() });
      }

      // This is the last batch
      if (batchesPending.size + 1 === batchesToSend) {
        metrics.shot({ action: "end-load", timestamp: Date.now() });
        clearInterval(sendInterval);
      }

      if (batchesPending.size < batchesToSend) {
        const batchId = batchesPending.size;
        batchesPending.add(batchId);

        console.log(
          new Date().toISOString(),
          "Sending batch:",
          batchId,
          "size:",
          batch.length,
          "distribution:",
          count(batch.map((s) => s.cu_id.toString()))
        );

        const sender = senderBalancer.next();
        await sender.check(batch, {
          batch: batchId,
          cus: count(batch.map((s) => s.cu_id.toString())),
          size: batch.length,
        });

        batchesSent.add(batchId);
        if (batchesSent.size === batchesToSend) {
          stopSignal();
        }

        console.log(new Date().toISOString(), "Batch sent:", batchId);
        console.log(
          new Date().toISOString(),
          "Pending batches:",
          collapseIntervals(setDiff(batchesPending, batchesSent))
        );
      }
    })().catch((e) => {
      console.log("WARNING: Failed to send batch:", e);
    });
  }, interval);

  // Dump metrics
  const metricsInterval = setInterval(() => {
    console.log(new Date().toISOString(), "Dumping metrics...");
    metrics.dump(metricsPath).catch((e) => {
      console.log("WARNING: Failed to dump metrics:", e);
    });
  }, 10000);

  await stopPromise;

  metrics.dump(metricsPath).catch((e) => {
    console.log("WARNING: Failed to dump metrics:", e);
  });

  console.log("Cleaning up...");
  clearInterval(metricsInterval);

  console.log("Done");
}
