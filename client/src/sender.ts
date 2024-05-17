import type { ethers } from "ethers";

import {
  DealClient,
  type ICapacity as Capacity,
} from "@fluencelabs/deal-ts-clients";

import type { Solution } from "./communicate.js";
import { Metrics, type Labels } from "./metrics.js";
import { submit, type ProofStatus } from "./submit.js";

export class Sender {
  private readonly signer: ethers.Signer;
  private nonce: number;

  private readonly capacity: Capacity;

  private constructor(
    signer: ethers.Signer,
    nonce: number,
    capacity: Capacity
  ) {
    this.signer = signer;
    this.nonce = nonce;
    this.capacity = capacity;
  }

  public static async create(signer: ethers.Signer) {
    const capacity = new DealClient(signer, "local").getCapacity();
    const nonce = await signer.getNonce();

    return new Sender(signer, nonce, capacity);
  }

  async check(
    solutions: Solution[],
    metrics: Metrics,
    labels: Labels
  ): Promise<ProofStatus> {
    const proofs = solutions.map(this.solutionToProof);

    const tx = await this.capacity.checkProofs.populateTransaction(proofs);
    tx.nonce = this.nonce;
    this.nonce++;

    return await submit(this.signer, tx, metrics, labels);
  }

  private solutionToProof(solution: Solution) {
    return {
      unitId: solution.cu_id,
      localUnitNonce: solution.local_nonce,
      resultHash: solution.result_hash,
    };
  }
}
