import { bench } from "./bench.js";

await bench({
  interval: 1000,
  cusNumber: 4,
  nodesNumber: 12,
  batchSize: 64,
  batchesToSend: 100,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});
