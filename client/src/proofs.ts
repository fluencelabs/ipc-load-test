import { ethers, type BytesLike } from "ethers";

// Solution from CCP
export interface Solution {
  local_nonce: BytesLike;
  cu_id: BytesLike;
  result_hash: BytesLike;
}

export class Proofs {
  private readonly cus: BytesLike[];
  private readonly proofs_per_cu: number;

  constructor(cus_number: number, proofs_per_cu: number) {
    this.proofs_per_cu = proofs_per_cu;
    const timestamp = Date.now();
    const cus = new Array(cus_number);
    for (let i = 0; i < cus_number; i++) {
      cus[i] = ethers.encodeBytes32String(`cu-${i}-${timestamp}`);
    }
    this.cus = cus;
  }

  batch(): Solution[] {
    return this.cus.flatMap((cu) =>
      Array(this.proofs_per_cu)
        .fill(0)
        .map(() => ({
          local_nonce: ethers.hexlify(ethers.randomBytes(32)),
          cu_id: cu,
          result_hash: ethers.hexlify(ethers.randomBytes(32)),
        }))
    );
  }
}
