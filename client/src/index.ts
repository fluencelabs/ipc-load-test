import { bench } from "./bench.js";

await bench({
  interval: 500,
  cusNumber: 4,
  nodesNumber: 1,
  batchSize: 64,
  batchesToSend: 10,
  configPath: "./config.json",
  metricsPath: "./metrics.json",
});
