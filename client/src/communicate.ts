import { EventEmitter } from "events";

import type { BytesLike } from "ethers";
import {
  JSONRPCClient,
  type JSONRPCResponse,
  JSONRPCErrorException,
} from "json-rpc-2.0";
import PQueue from "p-queue";

import { arrToHex, mapValues } from "./utils.js";

// Request to CCP
export interface Request {
  global_nonce: BytesLike;
  difficulty: BytesLike;
  cu_allocation: Record<number, BytesLike>;
}

export interface SolutionId {
  global_nonce: BytesLike;
  difficulty: BytesLike;
  idx: number;
}

// Solution from CCP
export interface Solution {
  id: SolutionId;
  local_nonce: BytesLike;
  cu_id: BytesLike;
  result_hash: BytesLike;
}

export class Communicate extends EventEmitter {
  private readonly client: JSONRPCClient;

  private proofIds: Record<string, number> = {};
  private polling = false;
  private pollTimeout: NodeJS.Timeout | undefined = undefined;
  private readonly interval: number;
  private readonly cuBatchSize: number;

  // concurrency: 1 so that we don't poll and request at the same time
  private readonly requests = new PQueue({ concurrency: 1 });

  constructor(url: string, cuBatchSize: number, interval: number = 1000) {
    super();

    const client: JSONRPCClient = new JSONRPCClient(async (jsonRPCRequest) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(jsonRPCRequest),
      });
      if (response.status === 200) {
        const json = await response.json();
        client.receive(json as JSONRPCResponse);
      } else if (jsonRPCRequest.id !== undefined) {
        return Promise.reject(new Error(response.statusText));
      }
    });

    this.client = client;
    this.cuBatchSize = cuBatchSize;
    this.interval = interval;
  }

  private reset_ids(with_cus?: BytesLike[] | undefined) {
    const cus = with_cus || Object.keys(this.proofIds);

    this.proofIds = {};
    for (const cu of cus) {
      this.proofIds[cu.toString()] = 0;
    }
  }

  request(req: Request): Promise<void> {
    return this.requests.add(
      async () => {
        try {
          await this.client.request("ccp_on_active_commitment", req);
          // CCP resets id on change of active commitment
          this.reset_ids(Object.values(req.cu_allocation));
        } catch (e) {
          console.error("Error from `ccp_on_active_commitment`: ", e);
        }
      },
      { priority: 1 } // Request has higher priority
    );
  }

  // Returns number of solutions received
  private async update() {
    const body = {
      reqs: mapValues(this.proofIds, idx => {
        return {
          last_seen_proof_idx: idx,
          proof_batch_size: this.cuBatchSize,
        }
      }),
      min_batch_count: 1,
      max_batch_count: 1,
    };
    const response = await this.client.request("get_batch_proofs_after", body);

    console.log("get_proof_batches_after:", response);

    // CCP returns byte arrays
    // for (const batch of response) {
    //   const solutions = batch.proof_batches.map((solution: any) => {
    //     solution.id.global_nonce = arrToHex(solution.id.global_nonce);
    //     solution.id.difficulty = arrToHex(solution.id.difficulty);
    //     solution.local_nonce = arrToHex(solution.local_nonce);
    //     solution.cu_id = arrToHex(solution.cu_id);
    //     solution.result_hash = arrToHex(solution.result_hash);
    //   });
    // }

    // const solutions = response as Solution[];
    // for (const solution of solutions) {
    //   this.emit("solution", solution);
    //   // this.proof_id = Math.max(this.proof_id, solution.id.idx);
    // }
  }

  private poll() {
    this.pollTimeout = setTimeout(() => {
      (async () =>
        this.requests.add(
          async () => {
            try {
              await this.update();
            } catch (e) {
              // Ignore code 1 (on_active_commitment in progress)
              if (e instanceof JSONRPCErrorException && e.code !== 1) {
                console.error(
                  "Error from `get_batch_proofs_after`: ",
                  JSON.stringify(e)
                );
              }
            }

            if (this.polling) {
              this.poll();
            }
          },
          { priority: 0 } // Poll has lower priority
        ))().catch((e) => {
          console.error("WARNING: Failed to poll: ", e);
        });
    }, this.interval);
  }

  private async stop() {
    await this.client.request("ccp_on_no_active_commitment", {});
  }

  async destroy() {
    this.removeAllListeners();
    this.polling = false;
    if (this.pollTimeout !== undefined) {
      clearTimeout(this.pollTimeout);
    }
    this.requests.clear();
    await this.requests.onIdle();
    await this.stop();
  }

  override on(event: "batch", listener: (batch: Solution[]) => void): this {
    if (!this.polling) {
      this.poll();
      this.polling = true;
    }

    return super.on(event, listener);
  }
}
