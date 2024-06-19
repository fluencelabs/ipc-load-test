import { bench } from "./bench.js";

const interval = 6400;
const duration = 60 * 60 * 1000;
const batches = Math.floor(duration / interval)
await bench({
  interval: interval,
  cusNumber: 16,
  sendersNumber: batches,
  proofsPerCu: 16,
  batchesToSend: batches,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});

process.exit(0);
