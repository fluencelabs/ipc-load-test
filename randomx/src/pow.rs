use chrono::Utc;
use rust_randomx::{Context, Hasher};
use std::sync::Arc;

use crate::hashers;
use crate::puzzle;

pub fn get_nonce() -> [u8; 32] {
    let ts: i64 = Utc::now().timestamp_nanos_opt().unwrap();
    let mut nonce = [0u8; 32];
    ts.to_be_bytes().iter().enumerate().for_each(|(i, b)| {
        nonce[i] = *b;
    });
    nonce
}

fn construct_hasher(g_nonce: &[u8], unit_id: &[u8]) -> ([u8; 32], Hasher) {
    let mut context_raw = vec![];
    context_raw.extend(g_nonce);
    context_raw.extend(unit_id);
    let context_hash = hashers::keccak_hasher(&context_raw);
    let context = Arc::new(Context::new(&context_hash, true));

    return (context_hash, Hasher::new(context));
}

pub fn randomx_gen(
    g_nonce: &[u8],
    unit_id: &[u8],
    n: u32
) -> Vec<puzzle::Solution> {
    let mut solutions = vec![];
    let (ch, hasher) = construct_hasher(g_nonce, unit_id);
    for i in 0..n {
        let nonce = get_nonce();
        let hash = hasher.hash(&nonce);
        let solution = puzzle::Solution::new(
            ch.to_vec(),
            g_nonce.to_vec(),
            unit_id.to_vec(),
            nonce.to_vec(),
            hash.as_ref().to_vec(),
        );
        solutions.push(solution);
    }

    solutions
}
