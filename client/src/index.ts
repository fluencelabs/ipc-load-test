import { bench } from "./bench.js";
import {
  BATCH_SIZE,
  CU_PER_PEER,
  METRICS_PATH,
  PROVIDERS_NUM,
} from "./const.js";

await bench(1, PROVIDERS_NUM, CU_PER_PEER, BATCH_SIZE, METRICS_PATH);
