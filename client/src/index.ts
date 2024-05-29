import { bench } from "./bench.js";

const interval = 1500;
const duration = 30 * 60 * 1000;
await bench({
  interval: interval,
  cusNumber: 4,
  sendersNumber: 24,
  batchSize: 64,
  batchesToSend: Math.floor(duration / interval),
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});

process.exit(0);
