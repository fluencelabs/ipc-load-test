import type { ethers } from "ethers";

import {
  DealClient,
  type ICapacity as Capacity,
} from "@fluencelabs/deal-ts-clients";

import type { Solution } from "./communicate.js";
import { Metrics, type Labels } from "./metrics.js";
import { DEFAULT_CONFIRMATIONS, idToNodeId } from "./const.js";
import { ExponentialBackoff, delay, timeouted } from "./utils.js";

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

  async check(solutions: Solution[], labels: Labels, backoff?: number | undefined, timeout = 5 * 60 * 1000) {
    const unitIds = solutions.map(s => s.cu_id);
    const localNonces = solutions.map(s => s.local_nonce);
    const resultHashes = solutions.map(s => s.result_hash);

    const nonce = this.nonce;
    this.nonce++;

    const end = this.metrics.start({
      ...labels,
      sender: this.id,
      nonce: nonce,
      node: idToNodeId(this.id),
    });

    const result = await timeouted(async () => {
      let back = backoff ? new ExponentialBackoff(backoff) : undefined;
      let receipt: ethers.TransactionResponse | undefined = undefined;
      while (receipt === undefined) {
        try {
          receipt = await this.capacity.checkProofs(unitIds, localNonces, resultHashes, { nonce });

          end({ status: "success" });
        } catch (e) {
          const status = analyzeError(e);

          end({ status });

          const d = back?.next();

          if (status != "error") {
            console.error(
              "WARNING:",
              d ? `Retrying in ${d} seconds` : "Not retrying",
              "transaction",
              nonce,
              "of sender",
              this.id,
              "after:",
              status
            );
          } else {
            console.error(
              "WARNING:",
              d ? `Retrying in ${d} seconds` : "Not retrying",
              "transaction",
              nonce,
              "of sender",
              this.id,
              "after unknown error:",
              e
            );
          }

          if (d) {
            await delay(d);
          } else {
            return status;
          }
        }
      }

      back = new ExponentialBackoff(100);
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

          const d = back?.next();
          if (d) {
            await delay(d);
          } else {
            return "confirm-error";
          }
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
