use reqwest;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering::Relaxed;

use crate::{BLOCK_KEY_OFFSET, BLOCK_KEY_DELAY, CURRENT_KEYBLOCK};

#[derive(Serialize, Deserialize, Debug)]
struct JSONRPCResponse {
    jsonrpc: String,
    id: u32,
    result: String,
}

// json-rpc call 
fn fetch_block_height(chain_uri: &str) -> Result<u64, &'static str> {
    let client = reqwest::blocking::Client::new();
    let res = client
        .post(chain_uri)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_blockNumber",
            "params": [],
            "id": 1,
        }))
        .send()
        .unwrap()
        .json::<JSONRPCResponse>();

    match res {
        Ok(res) => {
            let block = u64::from_str_radix(&res.result[2..], 16).unwrap();
            Ok(block)
        }
        Err(_) => Err("error"),
    }
}

// get key block from block height
fn make_keyblock(block_height: &u64) -> u64 {
    let key_block: u64;
    let block_num = std::cmp::max(1, *block_height);
    let rem = block_num % BLOCK_KEY_OFFSET as u64;
    if rem == 0 {
        key_block = std::cmp::max(1, block_num - BLOCK_KEY_OFFSET as u64);
    } else {
        key_block = std::cmp::max(1, block_num - rem);
    }
    key_block
}

fn updated_keyblock(block_height: u64, key_block: u64) -> bool {
    if key_block % BLOCK_KEY_OFFSET as u64 == 0 && block_height > key_block && key_block % BLOCK_KEY_DELAY as u64 == 0 {
        if CURRENT_KEYBLOCK.load(Relaxed) < key_block {
            CURRENT_KEYBLOCK.swap(key_block, Relaxed);
                return true;
        }
    }
    else if key_block < BLOCK_KEY_OFFSET as u64 && key_block > CURRENT_KEYBLOCK.load(Relaxed) {
        CURRENT_KEYBLOCK.swap(key_block, Relaxed);
        return true;
    }
    false
}

pub fn keyblock_handler(chain_uri: &str) -> Result<(u64, bool), ()> {
    
    let block_height = fetch_block_height(chain_uri).unwrap();
    let key_block = make_keyblock(&block_height);
    let update = updated_keyblock(block_height, key_block);

    Ok((key_block, update))

}