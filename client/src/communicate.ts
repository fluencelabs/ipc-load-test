import * as fs from "fs";
import * as readline from "readline";

const rustToJsPipe: string = "/tmp/rust_to_js_pipe";
const jsToRustPipe: string = "/tmp/js_to_rust_pipe";

export class Communicate {
  private readonly rustToJsStream: fs.ReadStream;
  private readonly jsToRustStream: fs.WriteStream;

  constructor() {
    this.rustToJsStream = fs.createReadStream(rustToJsPipe).setEncoding("utf8");

    this.jsToRustStream = fs.createWriteStream(jsToRustPipe);
  }

  setDifficulty(difficulty: string) {
    this.jsToRustStream.write(JSON.stringify({ difficulty }) + "\n");
  }

  setGlobalNonce(globalNonce: string) {
    this.jsToRustStream.write(JSON.stringify({ globalNonce }) + "\n");
  }

  onSolution(callback: (solution: any) => void) {
    readline
      .createInterface({ input: this.rustToJsStream })
      .on("line", (line: string) => {
        const json: any = JSON.parse(line);
        callback(json);
      });
  }
}
