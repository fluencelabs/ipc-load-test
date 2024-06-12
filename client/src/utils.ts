import { getBytes, type BytesLike } from "ethers";

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

export function mapValues<K extends string | number | symbol, T, S>(
  obj: Record<K, T>,
  fn: (v: T, k: K) => S
): Record<K, S> {
  const result = {} as Record<K, S>;
  for (const k in obj) {
    result[k] = fn(obj[k], k);
  }
  return result;
}