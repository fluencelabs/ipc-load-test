import { ethers } from "ethers";

import { Communicate } from "./communicate.js";
import { CCP_RPC_URL } from "./const.js";
import { ProofSet, makeSignal } from "./utils.js";

const seen = new ProofSet();

async function gather(n: number, cu: string) {
  const comm = new Communicate(CCP_RPC_URL);
  const alloc = {
    10: ethers.encodeBytes32String(cu),
  };

  comm.request({
    global_nonce: "0x" + "0".repeat(64),
    difficulty: "0x0000" + "ff".repeat(30),
    cu_allocation: alloc,
  });

  const [stopSignal, stopPromise] = makeSignal();

  let count = 0;
  comm.on("solution", (solution) => {
    if (seen.has(solution.cu_id.toString(), solution.local_nonce.toString())) {
      console.log(`[${cu}][${count}] Already seen solution:`, solution);
      return;
    } else {
      console.log(`[${cu}[${count}]] Solution: `, solution);
      seen.add(solution.cu_id.toString(), solution.local_nonce.toString());
    }

    count++;
    if (count === n) {
      comm.removeAllListeners();
      stopSignal();
    }
  });

  await stopPromise;

  await comm.destroy();
}

await gather(10, "first");
await gather(10, "second");
