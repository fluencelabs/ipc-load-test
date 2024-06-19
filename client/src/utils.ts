import { getBytes, type BytesLike } from "ethers";

export async function timeouted<T>(
  promise: () => Promise<T>,
  timeout: number
): Promise<T | undefined> {
  return Promise.race([
    promise(),
    new Promise<T | undefined>((resolve, _) =>
      setTimeout(() => resolve(undefined), timeout)
    ),
  ]);
}

export function makeSignal(): [() => void, Promise<void>] {
  let signal: () => void = () => { };
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

export class Balancer<T> {
  private readonly items: T[];
  private cur = 0;

  constructor(items: T[]) {
    this.items = items;
  }

  next(): T {
    const item = this.items[this.cur]!;
    this.cur = (this.cur + 1) % this.items.length;
    return item;
  }
}

export class ProofSet {
  private readonly map: Record<string, Set<string>> = {};

  add(cu: string, l: string) {
    if (this.map[cu] === undefined) {
      this.map[cu] = new Set();
    }

    this.map[cu]!.add(l);
  }

  has(cu: string, l: string) {
    if (this.map[cu] === undefined) {
      return false;
    }

    return this.map[cu]!.has(l);
  }
}

export function setDiff<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  const diff = new Set(set1);

  for (const item of set2) {
    diff.delete(item);
  }

  return diff;
}

export function collapseIntervals(numbers: Set<number>): string {
  if (numbers.size === 0) {
    return "none";
  }

  const sortedNumbers = Array.from(numbers).sort((a, b) => a - b);
  const result: string[] = [];
  let start = sortedNumbers[0];
  let end = start;

  for (let i = 1; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] === end + 1) {
      end = sortedNumbers[i];
    } else {
      if (start === end) {
        result.push(`${start}`);
      } else {
        result.push(`${start}-${end}`);
      }
      start = sortedNumbers[i];
      end = start;
    }
  }

  if (start === end) {
    result.push(`${start}`);
  } else {
    result.push(`${start}-${end}`);
  }

  return result.join(", ");
}

export class ExponentialBackoff {
  private cap: number;
  private factor: number;
  private currentTimeout: number;

  constructor(initialTimeout: number, cap: number = 60 * 1000, factor: number = 1.5) {
    this.cap = cap;
    this.factor = factor;
    this.currentTimeout = initialTimeout;
  }

  next(): number {
    const nextTimeout = this.currentTimeout;
    this.currentTimeout = Math.min(this.currentTimeout * this.factor, this.cap);
    return nextTimeout;
  }
}

