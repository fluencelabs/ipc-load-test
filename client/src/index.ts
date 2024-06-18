import { bench } from "./bench.js";

const interval = 3000;
const duration = 20 * 60 * 1000;
const batches = Math.floor(duration / interval)
await bench({
  interval: interval,
  cusNumber: 4,
  sendersNumber: batches,
  batchSize: 16,
  batchesToSend: batches,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});

process.exit(0);
