import * as fs from "fs";
import type { BytesLike } from "ethers";

const rustToJsPipe: string = "/tmp/rust_to_js_pipe";
const jsToRustPipe: string = "/tmp/js_to_rust_pipe";

export interface Request {
  globalNonce: BytesLike;
  CUIds: BytesLike[];
}

export interface Solution {
  ch: BytesLike;
  g_nonce: BytesLike;
  unit_id: BytesLike;
  nonce: BytesLike;
  hash: BytesLike;
}

export class Communicate {
  private readonly rustToJsStream: fs.ReadStream;
  private readonly jsToRustStream: fs.WriteStream;
  private buffer: string = "";

  constructor() {
    this.jsToRustStream = fs.createWriteStream(jsToRustPipe);
    this.rustToJsStream = fs.createReadStream(rustToJsPipe).setEncoding("utf8");
  }

  request(req: Request) {
    this.jsToRustStream.write(JSON.stringify(req) + "\n");
  }

  onSolution(callback: (solution: Solution) => void) {
    this.rustToJsStream.on("data", (data: string) => {
      this.buffer += data;
      const last = this.buffer.lastIndexOf("\n");
      if (last !== -1) {
        const lines = this.buffer.slice(0, last).split("\n");
        this.buffer = this.buffer.slice(last + 1);
        for (const line of lines) {
          if (line.length > 0) {
            callback(JSON.parse(line));
          }
        }
      }
    });
  }
}
