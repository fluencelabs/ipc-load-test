use chrono::Utc;
use randomx_rust_wrapper::{Cache, Dataset, RandomXFlags, RandomXVM};

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

pub struct Solver<'a> {
    ch: Vec<u8>,
    g_nonce: Vec<u8>,
    unit_id: Vec<u8>,
    vm: RandomXVM<'a, Dataset>,
}

impl Solver<'_> {
    pub fn construct(g_nonce: &[u8], unit_id: &[u8]) -> Self {
        let mut context_raw = vec![];
        context_raw.extend(g_nonce);
        context_raw.extend(unit_id);
        let context_hash = hashers::keccak_hasher(&context_raw);
        let flags = RandomXFlags::default();
        let cache = Cache::new(flags, &context_hash).unwrap();
        let dataset = Dataset::new(&cache, false).unwrap();
        let vm = RandomXVM::fast(flags, &dataset).unwrap();

        return Solver {
            ch: context_hash.to_vec(),
            g_nonce: g_nonce.to_vec(),
            unit_id: unit_id.to_vec(),
            vm,
        };
    }
}

impl Iterator for Solver<'_> {
    type Item = puzzle::Solution;

    fn next(&mut self) -> Option<Self::Item> {
        let nonce = get_nonce();
        let hash = self.vm.calculate_hash(&nonce);
        Some(puzzle::Solution::new(
            self.ch.clone(),
            self.g_nonce.clone(),
            self.unit_id.clone(),
            nonce.to_vec(),
            hash.as_ref().to_vec(),
        ))
    }
}
