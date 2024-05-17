import { getBytes, type BytesLike } from "ethers";

export function makeSignal(): [() => void, Promise<void>] {
  let signal: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    signal = resolve;
  });

  return [signal, promise];
}

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function arrToHex(arr: Uint8Array): string {
  return "0x" + Buffer.from(arr).toString("hex");
}

export function hexMin(hex1: BytesLike, hex2: BytesLike): BytesLike {
  const arr1 = getBytes(hex1);
  const arr2 = getBytes(hex2);

  if (arr1.length !== arr2.length) {
    throw new Error("Arrays must have the same length");
  }

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i]! < arr2[i]!) {
      return hex1;
    } else if (arr1[i]! > arr2[i]!) {
      return hex2;
    }
  }

  return hex1;
}

export function count(items: string[]): Record<string, number> {
  const countRecord: Record<string, number> = {};

  items.forEach((item) => {
    if (countRecord[item]) {
      countRecord[item]++;
    } else {
      countRecord[item] = 1;
    }
  });

  return countRecord;
}
