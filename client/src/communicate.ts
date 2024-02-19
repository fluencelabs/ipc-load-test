import { EventEmitter } from "events";

import type { BytesLike } from "ethers";
import { JSONRPCClient, type JSONRPCResponse } from "json-rpc-2.0";

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
}

export class Communicate extends EventEmitter {
  private readonly client: JSONRPCClient;

  private proof_id = 0;
  private polling = false;
  private readonly interval: number;

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

  async request(req: Request) {
    await this.client.request("ccp_on_active_commitment", req);
  }

  private poll() {
    setTimeout(async () => {
      const response = await this.client.request("ccp_get_proofs_after", {
        proof_idx: this.proof_id,
      });

      for (const solution of response) {
        solution.id.global_nonce = arrToHex(solution.id.global_nonce);
        solution.id.difficulty = arrToHex(solution.id.difficulty);
        solution.local_nonce = arrToHex(solution.local_nonce);
        solution.cu_id = arrToHex(solution.cu_id);
      }

      for (const solution of response as Solution[]) {
        this.emit("solution", solution);
      }

      this.poll();
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
