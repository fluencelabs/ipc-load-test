import { bench } from "./bench.js";

const interval = 1300;
const duration = 30 * 60 * 1000;
const batches = Math.floor(duration / interval)
await bench({
  interval: interval,
  cusNumber: 4,
  sendersNumber: batches,
  batchSize: 64,
  batchesToSend: batches,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});

process.exit(0);
