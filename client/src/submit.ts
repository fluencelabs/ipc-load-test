import { ethers } from "ethers";

import { Metrics, type Labels } from "./metrics.js";
import { DEFAULT_CONFIRMATIONS } from "./const.js";

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
  if (msg?.includes("not valid")) {
    return "invalid";
  }

  return "error";
}

export type ProofStatus = "success" | "invalid" | "error";

export async function submit(
  signer: ethers.Signer,
  tx: ethers.ContractTransaction,
  metrics: Metrics,
  labels: Labels
): Promise<ProofStatus> {
  const end = metrics.start(labels);

  let error: any = undefined;
  let status: ProofStatus = "error";
  for (let at = 0; at < 10; at++) {
    try {
      tx.gas = await signer.estimateGas(tx);

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
      error = e;
    }

    break;
  }

  end({ status: status, action: "estimate" });

  if (tx.gas === undefined || status !== "success") {
    if (status === "error") {
      console.error("WARNING: Failed to estimate gas:", error);
    }

    return status;
  }

  error = undefined;
  status = "error";
  let receipt: ethers.TransactionResponse | undefined = undefined;
  for (let at = 0; at < 10; at++) {
    try {
      receipt = await signer.sendTransaction(tx);

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
      error = e;
    }

    break;
  }

  end({ status: status, action: "send" });

  if (receipt === undefined || status !== "success") {
    if (status === "error") {
      console.error("WARNING: Failed to send:", error);
    }

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

    console.error("WARNING: Error waiting for confirmation:", message);
  }

  return status;
}
