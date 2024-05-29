import type { ethers } from "ethers";

import {
  DealClient,
  type ICapacity as Capacity,
} from "@fluencelabs/deal-ts-clients";

import type { Solution } from "./communicate.js";
import { Metrics, type Labels } from "./metrics.js";
import { DEFAULT_CONFIRMATIONS, idToNodeId } from "./const.js";
import { ExponentialBackoff, delay, timeouted } from "./utils.js";

function solutionToProof(solution: Solution) {
  return {
    unitId: solution.cu_id,
    localUnitNonce: solution.local_nonce,
    resultHash: solution.result_hash,
  };
}

type TxStatus = "http-err" | "seq-err" | "cache-err" | "error";

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

  async check(solutions: Solution[], labels: Labels, timeout = 20 * 60 * 1000) {
    const proofs = solutions.map(solutionToProof);

    const nonce = this.nonce;
    this.nonce++;

    const end = this.metrics.start({
      ...labels,
      sender: this.id,
      nonce: nonce,
      node: idToNodeId(this.id),
    });

    const result = await timeouted(async () => {
      let backoff = new ExponentialBackoff(100);
      let receipt: ethers.TransactionResponse | undefined = undefined;
      while (receipt === undefined) {
        try {
          receipt = await this.capacity.checkProofs(proofs, { nonce });

          end({ status: "success" });
        } catch (e) {
          const status = analyzeError(e);

          end({ status });

          const d = backoff.next();

          if (status != "error") {
            console.error(
              "WARNING: Retrying in", 
              d, 
              "transaction",
              nonce,
              "of sender",
              this.id,
              "after:",
              status
            );
          } else {
            console.error(
              "WARNING: Retrying in", 
              d, 
              "transaction",
              nonce,
              "after unknown error:",
              e
            );
          }

          await delay(d);
        }
      }

      backoff = new ExponentialBackoff(100);
      while (receipt !== undefined) {
        try {
          await receipt.wait(DEFAULT_CONFIRMATIONS, timeout);

          end({ status: "confirmed" });

          break;
        } catch (e) {
          end({ status: "confirm-error" });

          let message = "unknown";
          if (e instanceof Error) {
            message = e.message;
          }

          console.error("WARNING: Error waiting for confirmation:", message);

          await delay(backoff.next());
        }
      }

      return "success";
    }, timeout);

    if (result === undefined) {
      end({ status: "timeout" });

      console.log(
        "WARNING: Transaction",
        nonce,
        "of sender",
        this.id,
        "timed out"
      );
    }
  }
}
