import { ethers } from "ethers";

import { type ICapacityInterface as Capacity } from "@fluencelabs/deal-ts-clients";

import type { Solution } from "./communicate.js";
import { Metrics, type Labels } from "./metrics.js";
import { DEFAULT_CONFIRMATIONS } from "./const.js";
import { assert } from "console";

function solutionToProof(solution: Solution) {
  return {
    unitId: solution.cu_id,
    localUnitNonce: solution.local_nonce,
    resultHash: solution.result_hash,
  };
}

export type ProofStatus =
  | "success"
  | "invalid"
  | "not_started"
  | "not_active"
  | "error";

export async function submitProof(
  capacity: Capacity,
  solutions: Solution[],
  metrics: Metrics,
  labels: Labels
): Promise<ProofStatus> {
  assert(solutions.length == 1, "Only one solution is supported");

  const proofs = solutions.map(solutionToProof);
  const end = metrics.start(labels);

  let receipt: ethers.TransactionResponse | undefined = undefined;
  let status: ProofStatus = "error";
  for (let at = 0; at < 10; at++) {
    try {
      //  receipt = await capacity.submitProofs(proofs);
      receipt = await capacity.submitProof(
        proofs[0]?.unitId,
        proofs[0]?.localUnitNonce,
        proofs[0]?.resultHash
      );

      status = "success";
    } catch (e: any) {
      const error = e.error?.message || e.info?.error?.message;
      if (error?.includes("HTTP error")) {
        console.log("WARNING: Retrying send after HTTP error");
        continue;
      } else if (error?.includes("sequence")) {
        console.log("WARNING: Retrying send after sequence error");
        continue;
      } else if (error?.includes("already exists in cache")) {
        console.log('WARNING: Retrying send after "exists in cache" error');
        continue;
      }

      const data = e?.info?.error?.data;
      const msg = data ? Buffer.from(data, "hex").toString() : undefined;
      if (msg?.includes("already submitted")) {
        status = "success";
      } else if (msg?.includes("not valid")) {
        status = "invalid";
      } else if (msg?.includes("not started")) {
        status = "not_started";
      } else if (msg?.includes("not active")) {
        status = "not_active";
      } else if (data.startsWith("2c7d30ee")) {
        status = "invalid";
        const gnonce = data.slice(4 * 2, 4 * 2 + 32 * 2);
        const gunitnonce = data.slice(4 * 2 + 32 * 2, 4 * 2 + 32 * 4);
        const lnonce = data.slice(4 * 2 + 32 * 4, 4 * 2 + 32 * 6);
        const result = data.slice(4 * 2 + 32 * 6);
        console.log(
          `WARNING: Invalid proof result: gnonce = ${gnonce}, gunitnonce = ${gunitnonce}, lnonce = ${lnonce}, result = ${result}`
        );
      } else {
        status = "error";
        console.error("Error from `submitProof` for", solutions, ":", e);
      }
    }

    if (at > 0) {
      console.log("WARNING: Stop retrying send with status:", status);
    }

    break;
  }

  end({ status });

  if (receipt !== undefined) {
    try {
      await receipt.wait(DEFAULT_CONFIRMATIONS);

      end({ status: "confirmed" });
    } catch (e) {
      console.error("Error waiting for confirmation after `submitProof`:", e);
    }
  }

  return status;
}
