import { bench } from "./bench.js";

for (const p of [8]) {
  for (const b of [64]) {
    for (const c of [4]) {
      await bench(4, p, c, b, `./metrics_12n_${p}p_${b}b_${c}cu.json`);
    }
  }
}
