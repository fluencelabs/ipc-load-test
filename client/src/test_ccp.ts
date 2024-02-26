import readline from "readline";

import { Communicate, type Request } from "./communicate.js";
import { CCP_RPC_URL } from "./const.js";

const communicate = new Communicate(CCP_RPC_URL);

const difficulty = "0x000" + "f".repeat(61);
const cu_allocation = {
  10: "0x" + "01".repeat(32),
};

let global_nonce = 0;

communicate.on("solution", (solution) => {
  console.log("Received solution: ", solution);
});

readline.emitKeypressEvents(process.stdin);

process.stdin.on("keypress", async (str, key) => {
  if (key.ctrl && key.name === "c") {
    process.exit();
  }

  console.log("Requesting parameters...");
  const gnHex = "0x" + global_nonce.toString(16).padStart(64, "0");
  //global_nonce += 1;
  console.log("Global nonce: ", gnHex);
  await communicate.request({
    global_nonce: gnHex,
    difficulty,
    cu_allocation,
  });
});

process.stdin.setRawMode(true);

console.log("Press any key to request parameters...");
