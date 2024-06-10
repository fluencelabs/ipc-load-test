import { bench } from "./bench.js";

await bench({
  forEpoches: 4,
  providersNum: 2,
  cuPerPeer: 2,
  batchSize: 64,
  metricsPath: "metrics.json",
});
