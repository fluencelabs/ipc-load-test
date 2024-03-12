import { ethers } from "ethers";

import { type ICapacityInterface as Capacity } from "@fluencelabs/deal-ts-clients";

import type { Solution } from "./communicate.js";
import { Metrics } from "./metrics.js";
import { DEFAULT_CONFIRMATIONS } from "./const.js";

export type ProofStatus =
  | "success"
  | "invalid"
  | "not_started"
  | "not_active"
  | "error";

export async function submitProof(
  capacity: Capacity,
  solution: Solution,
  metrics: Metrics,
  labels: Record<string, string>
): Promise<ProofStatus> {
  const end = metrics.start(labels);

  let receipt: ethers.TransactionResponse | undefined = undefined;
  let status: ProofStatus = "error";
  for (let at = 0; at < 10; at++) {
    try {
      receipt = await capacity.submitProof(
        solution.cu_id,
        solution.local_nonce,
        solution.result_hash
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
      } else {
        status = "error";
        console.error("Error from `submitProof` for", solution, ":", e);
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
