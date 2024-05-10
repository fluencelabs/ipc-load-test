import { bench } from "./bench.js";

for (const p of [4, 8]) {
  for (const b of [32, 64]) {
    await bench(4, p, 1, b, `./metrics_12n_${p}p_${b}b_1cu_local.json`);
  }
}
