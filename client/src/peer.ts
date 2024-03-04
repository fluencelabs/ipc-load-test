import { type BytesLike } from "ethers";
import PQueue from "p-queue";
import { type ICapacityInterface as Capacity } from "@fluencelabs/deal-ts-clients";

import { type Solution } from "./communicate.js";
import { type PeerConfig } from "./config.js";
import { Metrics } from "./metrics.js";

import { DEFAULT_CONFIRMATIONS, BUFFER_PROOFS } from "./const.js";

// Peer sends proofs for CUs
export class Peer {
  private readonly config: PeerConfig;
  private readonly capacity: Capacity;

  // concurrency: 1 so that we don't submit many proofs at the same time
  private readonly queue: PQueue = new PQueue({
    concurrency: 1,
    timeout: 60000, // 60s
    throwOnTimeout: true,
  });

  private not_started = false;

  private readonly metrics: Metrics;
  private readonly defaultLabels: { [key: string]: string };

  constructor(
    config: PeerConfig,
    capacity: Capacity,
    metrics: Metrics,
    defultLabels: { [key: string]: string } = {}
  ) {
    this.config = config;
    this.capacity = capacity;
    this.metrics = metrics;
    this.defaultLabels = defultLabels;
  }

  async init() {
    this.queue.on("idle", () => {
      // This could happen in the first epoch or at the beginning of a new epoch
      // But should not happen mid-epoch, otherwise lower difficulty for CCP
      console.warn("WARNING: Queue for peer", this.config.owner_sk, "is empty");
    });
  }

  is(id: string) {
    return this.config.owner_sk === id;
  }

  proofs(): number {
    return this.queue.size + this.queue.pending;
  }

  clear() {
    this.not_started = false;
    this.queue.clear();
  }

  hasCU(cu_id: BytesLike): Boolean {
    return this.config.cu_ids.includes(cu_id);
  }

  submitProof(solution: Solution) {
    if (!this.hasCU(solution.cu_id)) {
      throw new Error("Peer does not have CU ID: " + solution.cu_id);
    }

    // Don't submit more proofs in this epoch
    if (this.not_started) {
      return;
    }

    // Drop excess proofs
    if (this.queue.size >= BUFFER_PROOFS) {
      return;
    }

    this.queue
      .add(async () => {
        const labels = {
          ...this.defaultLabels,
          peer: this.config.owner_sk,
          cu_id: solution.cu_id.toString(),
        };

        const end = this.metrics.start(labels);
        try {
          const submitProofTx = await this.capacity.submitProof(
            solution.cu_id,
            solution.local_nonce,
            solution.result_hash
          );
          end({ status: "success" });
          // We should wait confirmations
          await submitProofTx.wait(DEFAULT_CONFIRMATIONS);
          end({ status: "confirmed" });
        } catch (e: any) {
          // Classify error
          const data = e?.info?.error?.data;
          const msg = data ? Buffer.from(data, "hex").toString() : undefined;
          let status = "error";
          if (msg?.includes("not valid")) {
            status = "invalid";
          } else if (msg?.includes("not started")) {
            this.not_started = true;
            status = "not_started";
          } else if (msg?.includes("not active")) {
            status = "not_active";
          } else {
            console.error("Error from `submitProof` for", solution, ":", e);
          }

          end({ status: status });
        }
      })
      .catch((e) => {
        console.error(
          "Error submitting (probably timeout) for",
          this.config.owner_sk,
          ":",
          e.message
        );
      });
  }
}
