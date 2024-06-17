import { bench } from "./bench.js";

const interval = 1600;
const duration = 20 * 60 * 1000;
const batches = Math.floor(duration / interval)
await bench({
  interval: interval,
  cusNumber: 8,
  sendersNumber: batches,
  batchSize: 64,
  batchesToSend: batches,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});

process.exit(0);
