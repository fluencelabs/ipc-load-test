import type { ethers } from "ethers";

import {
  DealClient,
  type ICapacity as Capacity,
} from "@fluencelabs/deal-ts-clients";

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

type TxStatus = "http-err" | "seq-err" | "cache-err" | "error";

function isRetryTxStatus(status: TxStatus): boolean {
  return ["http-err", "seq-err", "cache-err"].includes(status);
}

function analyzeError(e: any): TxStatus {
  const error = e.error?.message || e.info?.error?.message;
  if (error?.includes("HTTP error")) {
    return "http-err";
  } else if (error?.includes("sequence")) {
    return "seq-err";
  } else if (error?.includes("already exists in cache")) {
    return "cache-err";
  }

  return "error";
}

export class Sender {
  private readonly id: number;

  private readonly signer: ethers.Signer;
  private nonce: number;

  private readonly capacity: Capacity;

  private readonly metrics: Metrics;

  private constructor(
    id: number,
    signer: ethers.Signer,
    nonce: number,
    capacity: Capacity,
    metrics: Metrics
  ) {
    this.id = id;
    this.signer = signer;
    this.nonce = nonce;
    this.capacity = capacity;
    this.metrics = metrics;
  }

  public static async create(
    id: number,
    signer: ethers.Signer,
    metrics: Metrics
  ) {
    const capacity = new DealClient(signer, "local").getCapacity();
    const nonce = await signer.getNonce();

    return new Sender(id, signer, nonce, capacity, metrics);
  }

  async check(solutions: Solution[], labels: Labels) {
    const proofs = solutions.map(solutionToProof);

    const nonce = this.nonce;
    this.nonce++;

    const end = this.metrics.start({
      ...labels,
      sender: this.id,
      nonce: nonce,
    });

    let receipt: ethers.TransactionResponse | undefined = undefined;
    while (receipt === undefined) {
      try {
        receipt = await this.capacity.checkProofs(proofs, { nonce });

        end({ status: "success" });
      } catch (e) {
        const status = analyzeError(e);
        if (status != "error") {
          console.error(
            "WARNING: Retrying transaction",
            nonce,
            "after:",
            status
          );
        } else {
          console.error(
            "WARNING: Retrying transaction",
            nonce,
            "after unknown error:",
            e
          );
        }
      }
    }

    while (receipt !== undefined) {
      try {
        await receipt.wait(DEFAULT_CONFIRMATIONS);

        end({ status: "confirmed" });

        break;
      } catch (e) {
        let message = "unknown";
        if (e instanceof Error) {
          message = e.message;
        }

        console.error("WARNING: Error waiting for confirmation:", message);
      }
    }
  }
}
