import { ethers, type BytesLike } from "ethers";
import PQueue from "p-queue";
import {
  type ICapacityInterface as Capacity,
  type ICoreInterface as Core,
} from "@fluencelabs/deal-ts-clients";

import { type Solution } from "./communicate.js";
import { type PeerConfig } from "./config.js";
import { Metrics, type Labels } from "./metrics.js";

import { BUFFER_BATCHES } from "./const.js";
import { submitProof } from "./submit.js";
import { count } from "./utils.js";

// Peer sends proofs for CUs
export class Peer {
  private readonly config: PeerConfig;
  private readonly capacity: Capacity;
  private readonly core: Core;
  private readonly rpc: ethers.JsonRpcProvider;

  private rpcEpoch = 0;
  private rpcBlock = 0;

  private batch: Solution[] = [];
  // concurrency: 1 so that we don't submit many proofs at the same time
  private readonly queue: PQueue = new PQueue({
    concurrency: 1,
    timeout: 120000, // 120s
    throwOnTimeout: true,
  });

  private epoch: number = 0;
  private no_send_epoch: number = 0;

  private readonly batchSize: number;
  private readonly metrics: Metrics;
  private readonly defaultLabels: Labels;

  constructor(
    config: PeerConfig,
    capacity: Capacity,
    core: Core,
    rpc: ethers.JsonRpcProvider,
    batchSize: number,
    metrics: Metrics,
    defultLabels: Labels = {}
  ) {
    this.config = config;
    this.capacity = capacity;
    this.core = core;
    this.rpc = rpc;
    this.batchSize = batchSize;
    this.metrics = metrics;
    this.defaultLabels = defultLabels;
  }

  async init(epoch: number) {
    this.queue.on("idle", () => {
      // This could happen in the first epoch or at the beginning of a new epoch
      // But should not happen mid-epoch, otherwise lower difficulty for CCP
      console.warn("WARNING: Queue for peer", this.config.owner_sk, "is empty");
    });
    await this.rpc.on("block", (_) => {
      (async () => {
        try {
          this.rpcBlock = Number(await this.rpc.getBlockNumber());
        } catch (e) {
          console.error("WARNING: Failed to get block number:", e);
        }
        try {
          this.rpcEpoch = Number(await this.core.currentEpoch());
        } catch (e) {
          console.error("WARNING: Failed to get epoch:", e);
        }
      })().catch((e) => {
        console.error("WARNING: Failed to process block:", e);
      });
    });
    this.epoch = epoch;
  }

  getBlock(): number {
    return this.rpcBlock;
  }

  getEpoch(): number {
    return this.rpcEpoch;
  }

  is(id: string) {
    return this.config.owner_sk === id;
  }

  batches(): number {
    return this.queue.size + this.queue.pending;
  }

  proofs(): number {
    return this.batches() * this.batchSize + this.batch.length;
  }

  clear(newEpoch?: number | undefined) {
    this.batch = [];
    this.queue.clear();
    if (newEpoch !== undefined) {
      this.epoch = newEpoch;
    }
  }

  hasCU(cu_id: BytesLike): boolean {
    return this.config.cu_ids.includes(cu_id);
  }

  submitSolution(solution: Solution) {
    if (!this.hasCU(solution.cu_id)) {
      throw new Error("Peer does not have CU ID: " + solution.cu_id);
    }

    // Don't submit more proofs in this epoch
    if (this.no_send_epoch === this.epoch) {
      return;
    }

    // Drop excess proofs
    if (this.queue.size >= BUFFER_BATCHES) {
      return;
    }

    this.batch.push(solution);

    if (this.batch.length < this.batchSize) {
      return;
    }

    const batch = this.batch;
    this.batch = [];

    const labels = {
      ...this.defaultLabels,
      peer: this.config.owner_sk,
      cus: count(batch.map((s) => s.cu_id.toString())),
      size: batch.length,
      epoch: this.epoch,
    };

    this.queue
      .add(async () => {
        const sendEpoch = this.epoch;

        const status = await submitProof(
          this.capacity,
          batch,
          this.metrics,
          labels
        );

        if (status === "not_started" || status === "invalid") {
          this.no_send_epoch = sendEpoch;
          this.clear();
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

  async destroy() {
    this.queue.clear();
    if (this.queue.pending > 0) {
      await this.queue.onIdle();
    }
    await this.rpc.removeAllListeners();
    this.rpc.destroy();
  }
}
