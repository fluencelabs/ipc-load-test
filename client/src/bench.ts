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
  const tx = await signer.sendTransaction({
    to: to,
    value: ethers.parseEther(amount.toString()), 
  });
  await tx.wait(DEFAULT_CONFIRMATIONS);
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
  batchSize: number;
  batchesToSend: number;
  configPath: string;
  metricsPath: string;
};

export async function bench({
  interval,
  cusNumber,
  sendersNumber,
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

  console.log("Initializing senders...");

  const senders: Sender[] = [];
  for (let i = 0; i < pkeys.length; i++) {
    const senderRpc = new ethers.JsonRpcProvider(ETH_API_URL(i));
    await senderRpc.on("error", (e) => {
      console.log("WARNING: Node", i, "RPC error:", e);
    });
    const senderSigner = new ethers.Wallet(pkeys[i]!, senderRpc);

    console.log("Getting balance of", senderSigner.address);

    const balance = await rpc.getBalance(senderSigner.address);

    console.log("Balance:", ethers.formatEther(balance));

    if (balance < ethers.parseEther("300")) {
      await transfer(signer, senderSigner.address, 400);
    }

    const sender = await Sender.create(i, senderSigner, metrics);
    senders.push(sender);
  }

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

  const communicate = new Communicate(CCP_RPC_URL, interval / 2);

  console.log("Requesting parameters...");

  await communicate.request({
    global_nonce: CHAIN_GNONCE_HARDCODED,
    difficulty: CCP_DIFFICULTY,
    cu_allocation,
  });

  const [startSignal, startPromise] = makeSignal();
  let buffered = false;

  const [stopSignal, stopPromise] = makeSignal();

  const batchesPending: Set<number> = new Set();
  const batchesSent: Set<number> = new Set();
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
      } else if (!buffered) {
        buffered = true;
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
    if (batch === undefined || batch.length < batchSize) {
      console.error("FATAL: No batch to send, increase CCP_DIFFICULTY");

      metrics.shot({ action: "end-load" });
      clearInterval(sendInterval);
      stopSignal();
    } else {
      (async () => {
        // This is the first batch
        if (batchesPending.size === 0) {
          metrics.shot({ action: "start-load" });
        }

        // This is the last batch
        if (batchesPending.size + 1 === batchesToSend) {
          metrics.shot({ action: "end-load" });
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
            batch.length
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
    }
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

  await communicate.destroy();
  clearInterval(metricsInterval);

  console.log("Done");
}
