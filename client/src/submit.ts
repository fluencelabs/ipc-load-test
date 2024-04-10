import { ethers } from "ethers";
import assert from "assert";

import { type ICapacityInterface as Capacity } from "@fluencelabs/deal-ts-clients";

import type { Solution } from "./communicate.js";
import { Metrics, type Labels } from "./metrics.js";
import { DEFAULT_CONFIRMATIONS } from "./const.js";

function solutionToProof(solution: Solution) {
  return {
    unitId: solution.cu_id,
    localUnitNonce: solution.local_nonce,
    resultHash: solution.result_hash,
  };
}

type RetryTxStatus = "http-err" | "seq-err" | "cache-err";

function isRetryTxStatus(value: any): value is RetryTxStatus {
  return ["http-err", "seq-err", "cache-err"].includes(value);
}

type ProofTxStatus = ProofStatus | RetryTxStatus;

function analyzeError(e: any): ProofTxStatus {
  const error = e.error?.message || e.info?.error?.message;
  if (error?.includes("HTTP error")) {
    return "http-err";
  } else if (error?.includes("sequence")) {
    return "seq-err";
  } else if (error?.includes("already exists in cache")) {
    return "cache-err";
  }

  const data = e?.info?.error?.data;
  const msg = data ? Buffer.from(data, "hex").toString() : undefined;
  if (msg?.includes("already submitted")) {
    return "success";
  } else if (msg?.includes("not valid")) {
    return "invalid";
  } else if (msg?.includes("not started")) {
    return "not_started";
  } else if (msg?.includes("not active")) {
    return "not_active";
  }

  return "error";
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
  assert(solutions.length == 1, "Submit only one solution at a time");

  const proofs = solutions.map(solutionToProof);
  const proof = proofs[0]!;

  const end = metrics.start(labels);

  let status: ProofStatus = "error";
  let gas: bigint | undefined = undefined;
  for (let at = 0; at < 10; at++) {
    try {
      gas = await capacity.submitProof.estimateGas(
        proof.unitId,
        proof.localUnitNonce,
        proof.resultHash
      );

      status = "success";
    } catch (e: any) {
      const error_status = analyzeError(e);
      if (isRetryTxStatus(error_status)) {
        console.error(
          "WARNING: Retrying estimateGas after status:",
          error_status,
          "error:",
          e
        );
        continue;
      }

      status = error_status;
    }

    break;
  }

  end({ status: status, action: "estimate" });

  if (gas === undefined || status !== "success") {
    return status;
  }

  status = "error";
  let receipt: ethers.TransactionResponse | undefined = undefined;
  for (let at = 0; at < 10; at++) {
    try {
      receipt = await capacity.submitProof(
        proof.unitId,
        proof.localUnitNonce,
        proof.resultHash,
        { gasLimit: gas }
      );

      status = "success";
    } catch (e: any) {
      const error_status = analyzeError(e);
      if (isRetryTxStatus(error_status)) {
        console.error(
          "WARNING: Retrying send after status:",
          error_status,
          "error:",
          e
        );
        continue;
      }

      status = error_status;
    }

    break;
  }

  end({ status: status, action: "send" });

  if (receipt === undefined || status !== "success") {
    return status;
  }

  try {
    await receipt.wait(DEFAULT_CONFIRMATIONS);

    end({ status: "confirmed" });
  } catch (e) {
    let message = "unknown";
    if (e instanceof Error) {
      message = e.message;
    }

    console.error(
      "WARNING: Error waiting for confirmation after `submitProof`:",
      message
    );
  }

  return status;
}
