import { bench } from "./bench.js";

const interval = 3200;
const duration = 60 * 60 * 1000;
const cus = 8;
const proofs = 16;
const batches = Math.floor(duration / interval)
await bench({
  interval: interval,
  cusNumber: cus,
  sendersNumber: batches,
  proofsPerCu: proofs,
  batchesToSend: batches,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});

process.exit(0);
