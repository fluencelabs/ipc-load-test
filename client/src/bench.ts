import { ethers, type BytesLike, type AddressLike } from "ethers";

import {
  CCP_RPC_URL,
  DEFAULT_ETH_API_URL,
  PRIVATE_KEY,
  DEFAULT_CONFIRMATIONS,
  ETH_API_URL,
  CHAIN_GNONCE_HARDCODED,
  CCP_DIFFICULTY,
  BUFFER_BATCHES,
} from "./const.js";
import { Communicate, type Solution } from "./communicate.js";
import { Metrics } from "./metrics.js";
import { Balancer, makeSignal, count, ProofSet } from "./utils.js";
import { Sender } from "./sender.js";
import { readConfig, writeConfig } from "./config.js";

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

export type BenchParams = {
  interval: number;
  cusNumber: number;
  nodesNumber: number;
  batchSize: number;
  batchesToSend: number;
  configPath: string;
  metricsPath: string;
};

export async function bench({
  interval,
  cusNumber,
  nodesNumber,
  batchSize,
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

  if (config.private_keys.length < nodesNumber) {
    console.log("Initializing new private keys...");
  }

  for (let i = config.private_keys.length; i < nodesNumber; i++) {
    const wallet = ethers.Wallet.createRandom();
    config.private_keys.push(wallet.privateKey);
  }

  writeConfig(configPath, config);

  const pkeys = config.private_keys;

  const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);
  await rpc.on("error", (e) => {
    console.log("WARNING: RPC error:", e);
  });
  const signer = new ethers.Wallet(PRIVATE_KEY, rpc);

  const metrics = new Metrics();

  console.log("Initializing senders...");

  const senders: Sender[] = [];
  for (let i = 0; i < pkeys.length; i++) {
    const senderRpc = new ethers.JsonRpcProvider(ETH_API_URL(i));
    await senderRpc.on("error", (e) => {
      console.log("WARNING: Node", i, "RPC error:", e);
    });
    const senderSigner = new ethers.Wallet(pkeys[i]!, senderRpc);

    const balance = await rpc.getBalance(senderSigner.address);
    if (balance < ethers.parseEther("100")) {
      console.log("Adding 200 ETH to", senderSigner.address);

      await transfer(signer, senderSigner.address, "200");
    }

    const sender = await Sender.create(i, senderSigner, metrics);
    senders.push(sender);
  }

  const senderBalancer = new Balancer(senders);

  const timestamp = Date.now();
  const cu_allocation: Record<number, BytesLike> = {};
  for (let i = 0; i < cusNumber; i++) {
    cu_allocation[i + 4] = ethers.encodeBytes32String(
      "cu-" + i.toString() + "-" + timestamp.toString()
    );
  }

  const communicate = new Communicate(CCP_RPC_URL, interval / 2);

  console.log("Requesting parameters...");

  await communicate.request({
    global_nonce: CHAIN_GNONCE_HARDCODED,
    difficulty: CCP_DIFFICULTY,
    cu_allocation,
  });

  const [startSignal, startPromise] = makeSignal();
  let started = false;

  const [stopSignal, stopPromise] = makeSignal();

  let batchesSent = 0;
  let batchesPending = 0;
  const batches: Solution[][] = [];
  const seen = new ProofSet();

  console.log("Buffering solutions...");

  communicate.on("solution", (solution: Solution) => {
    const cuStr = solution.cu_id.toString();
    const lnStr = solution.local_nonce.toString();

    if (seen.has(cuStr, lnStr)) {
      console.log("WARNING: Already seen solution:", solution);
      return;
    }

    seen.add(cuStr, lnStr);

    const lastBatch = batches[batches.length - 1];
    if (lastBatch === undefined || lastBatch.length === batchSize) {
      if (batches.length < BUFFER_BATCHES) {
        batches.push([solution]);
      } else if (!started) {
        started = true;
        startSignal();
      }
    } else {
      lastBatch.push(solution);
    }
  });

  await startPromise;

  console.log("Starting benchmark...");

  const sendInterval = setInterval(() => {
    const batch = batches.shift();
    if (batch === undefined) {
      console.error("FATAL: No batch to send, increase CCP_DIFFICULTY");
      stopSignal();
    } else {
      (async () => {
        if (batchesPending < batchesToSend) {
          // To call stopSignal exactly once
          const batchId = batchesPending;
          batchesPending++;

          console.log(
            new Date().toISOString(),
            "Sending batch:",
            batchId,
            "size:",
            batch.length
          );

          const sender = senderBalancer.next();
          await sender.check(batch, {
            batch: batchId,
            cus: count(batch.map((s) => s.cu_id.toString())),
            size: batch.length,
          });

          console.log(new Date().toISOString(), "Batch sent:", batchId);

          batchesSent++;
          if (batchesSent === batchesToSend) {
            stopSignal();
          }
        }
      })().catch((e) => {
        console.log("WARNING: Failed to send batch:", e);
      });
    }
  }, interval);

  // Dump metrics
  const metricsInterval = setInterval(() => {
    metrics.dump(metricsPath).catch((e) => {
      console.log("WARNING: Failed to dump metrics:", e);
    });
  }, 10000);

  await stopPromise;

  metrics.dump(metricsPath).catch((e) => {
    console.log("WARNING: Failed to dump metrics:", e);
  });

  console.log("Cleaning up...");

  clearInterval(sendInterval);
  clearInterval(metricsInterval);
  await communicate.destroy();
  await rpc.removeAllListeners();
  rpc.destroy();

  console.log("Done");
}
