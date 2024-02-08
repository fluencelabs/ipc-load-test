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

pub fn construct_solver(g_nonce: &[u8], unit_id: &[u8]) -> Solver {
    let mut context_raw = vec![];
    context_raw.extend(g_nonce);
    context_raw.extend(unit_id);
    let context_hash = hashers::keccak_hasher(&context_raw);
    let context = Arc::new(Context::new(&context_hash, true));

    return Solver {
        ch: context_hash.to_vec(),
        g_nonce: g_nonce.to_vec(),
        unit_id: unit_id.to_vec(),
        hasher: Hasher::new(context),
    };
}

pub struct Solver {
    ch: Vec<u8>,
    g_nonce: Vec<u8>,
    unit_id: Vec<u8>,
    hasher: Hasher,
}

impl Iterator for Solver {
    type Item = puzzle::Solution;

    fn next(&mut self) -> Option<Self::Item> {
        let nonce = get_nonce();
        let hash = self.hasher.hash(&nonce);
        Some(puzzle::Solution::new(
            self.ch.clone(),
            self.g_nonce.clone(),
            self.unit_id.clone(),
            nonce.to_vec(),
            hash.as_ref().to_vec(),
        ))
    }
}
