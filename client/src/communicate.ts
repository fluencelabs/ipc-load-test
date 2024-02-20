import { EventEmitter } from "events";

import type { BytesLike } from "ethers";
import { JSONRPCClient, type JSONRPCResponse } from "json-rpc-2.0";
import PQueue from "p-queue";

import { arrToHex } from "./utils.js";

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

export interface Solution {
  id: SolutionId;
  local_nonce: BytesLike;
  cu_id: BytesLike;
  result_hash: BytesLike;
}

export class Communicate extends EventEmitter {
  private readonly client: JSONRPCClient;

  private proof_id = 0;
  private polling = false;
  private readonly interval: number;

  private readonly requests = new PQueue({ concurrency: 1 });

  constructor(url: string, interval: number = 1000) {
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
    this.interval = interval;
  }

  request(req: Request) {
    this.requests.add(
      async () => {
        try {
          this.proof_id = 0;
          await this.client.request("ccp_on_active_commitment", req);
        } catch (e) {
          console.error("Error from `ccp_on_active_commitment`: ", e);
        }
      },
      { priority: 1 }
    );
  }

  private async update(limit: number) {
    const response = await this.client.request("ccp_get_proofs_after", {
      proof_idx: this.proof_id,
      limit: limit,
    });

    for (const solution of response) {
      solution.id.global_nonce = arrToHex(solution.id.global_nonce);
      solution.id.difficulty = arrToHex(solution.id.difficulty);
      solution.local_nonce = arrToHex(solution.local_nonce);
      solution.cu_id = arrToHex(solution.cu_id);
      solution.result_hash = arrToHex(solution.result_hash);
    }

    const solutions = response as Solution[];
    for (const solution of solutions) {
      this.emit("solution", solution);
      this.proof_id = Math.max(this.proof_id, solution.id.idx);
    }

    return solutions.length;
  }

  private poll() {
    setTimeout(async () => {
      this.requests.add(
        async () => {
          const limit = 10;
          try {
            for (let i = 0; i < 10; i++) {
              const count = await this.update(limit);
              if (count < limit) {
                break;
              }
            }
          } catch (e) {
            console.error("Error from `ccp_get_proofs_after`: ", e);
          }

          this.poll();
        },
        { priority: 0 }
      );
    }, this.interval);
  }

  override on(event: "solution", listener: (solution: Solution) => void): this {
    if (!this.polling) {
      this.poll();
      this.polling = true;
    }

    return super.on(event, listener);
  }
}
