import { Communicate, type Solution } from "./communicate.js";
import { CCP_RPC_URL } from "./const.js";

const comm = new Communicate(CCP_RPC_URL);

const gnonce = "0x" + "00".repeat(32);
const cu_alloc = {
    4: "0x" + "00".repeat(32),
    5: "0x" + "01".repeat(32),
    6: "0x" + "02".repeat(32),
    7: "0x" + "03".repeat(32)
}
const difficulty = "0x00" + "ff".repeat(31);

await comm.request({
    global_nonce: gnonce,
    difficulty: difficulty,
    cu_allocation: cu_alloc
})

comm.on("batch", solutions => {
    console.log(solutions);
})