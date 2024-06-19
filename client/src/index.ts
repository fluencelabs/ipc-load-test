import { bench } from "./bench.js";

const interval = 4800;
const cus = 12;
const proofs = 16;
const duration = 20 * 1000;
const batches = Math.floor(duration / interval)
await bench({
  interval: interval,
  cusNumber: cus,
  sendersNumber: batches,
  proofsPerCu: proofs,
  batchesToSend: batches,
  configPath: `./config-${cus}-${proofs}.json`,
  metricsPath: `./metrics-${cus}-${proofs}.json`,
});

process.exit(0);
