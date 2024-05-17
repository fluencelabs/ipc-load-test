import { bench } from "./bench.js";

const interval = 5000;
const duration = 2 * 60 * 1000;
await bench({
  interval: interval,
  cusNumber: 4,
  nodesNumber: 12,
  batchSize: 64,
  batchesToSend: duration / interval,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});
