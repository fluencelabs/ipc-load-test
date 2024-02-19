export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function arrToHex(arr: Uint8Array): string {
  return "0x" + Buffer.from(arr).toString("hex");
}
