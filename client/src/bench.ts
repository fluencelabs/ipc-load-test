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
import { makeSignal } from "./utils.js";
import { Sender } from "./sender.js";

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

export async function bench(
  interval: number,
  cusNumber: number,
  batchSize: number,
  batchesToSend: number,
  metricsPath: string
) {
  const rpc = new ethers.JsonRpcProvider(DEFAULT_ETH_API_URL);
  await rpc.on("error", (e) => {
    console.log("WARNING: RPC error:", e);
  });
  const signer = new ethers.Wallet(PRIVATE_KEY, rpc);
  const sender = await Sender.create(signer);

  const metrics = new Metrics();

  const cu_allocation: Record<number, BytesLike> = {};
  for (let i = 0; i < cusNumber; i++) {
    cu_allocation[i + 4] = ethers.encodeBytes32String("cu-" + i.toString());
  }

  const communicate = new Communicate(CCP_RPC_URL, 5000);

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
  let batches: Solution[][] = [];

  console.log("Buffering solutions...");

  communicate.on("solution", (solution: Solution) => {
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
        if (batchesSent < batchesToSend) {
          batchesSent++;
          // To call stopSignal exactly once
          const savedBatchesSent = batchesSent;

          console.log(
            new Date().toISOString(),
            "Sending batch:",
            batchesSent,
            "size:",
            batch.length
          );

          const status = await sender.check(batch, metrics, {});

          console.log(
            new Date().toISOString(),
            "Batch sent:",
            savedBatchesSent,
            "status:",
            status
          );

          if (savedBatchesSent === batchesToSend) {
            stopSignal();
          }
        }
      })();
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
