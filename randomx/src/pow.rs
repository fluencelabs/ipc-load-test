use chrono::Utc;
use crossbeam::channel::{Receiver, Sender};
use rust_randomx::{Context, Hasher};
use std::sync::Arc;
use std::thread;

use crate::hashers;
use crate::mocks;
use crate::puzzle;

pub enum Event {
    GNonce(u64),
    Difficulty(u32),
    UnitId(String),
    Stop,
}

pub fn get_nonce(g_nonce: &u64) -> [u8; 32] {
    let nonce_raw: i64 = Utc::now().timestamp_nanos_opt().unwrap() + *g_nonce as i64;
    return mocks::signer(&nonce_raw.to_le_bytes().to_vec());
}

fn construct_hasher(g_nonce: &u64, unit_id: &str) -> Hasher {
    let context_raw = format!("{}{}", g_nonce, unit_id);
    let context_hash = hashers::keccak_hasher(&context_raw);
    let signed_context = mocks::signer(&context_hash.to_vec());
    let context = Arc::new(Context::new(&signed_context, true));

    return Hasher::new(context);
}

pub fn randomx_instance(
    events: &Receiver<Event>,
    solutions: &Sender<puzzle::PuzzleSolution>,
) -> thread::JoinHandle<()> {
    return thread::spawn(move || {
        let mut g_nonce: u64 = 0;
        let mut difficulty = 100;
        let mut unit_id = String::from("none");

        let mut hasher = construct_hasher(&g_nonce, &unit_id);

        let mut nonce = get_nonce(&g_nonce);
        hasher.hash_first(&nonce);

        loop {
            while let Ok(ev) = events.try_recv() {
                match ev {
                    Event::GNonce(g) => {
                        g_nonce = g;
                        hasher = construct_hasher(&g_nonce, &unit_id);
                        hasher.hash_first(&get_nonce(&g_nonce));
                    }
                    Event::Difficulty(d) => {
                        difficulty = d;
                    }
                    Event::UnitId(u) => {
                        unit_id = u;
                        hasher = construct_hasher(&g_nonce, &unit_id);
                        hasher.hash_first(&get_nonce(&g_nonce));
                    }
                    Event::Stop => {
                        return;
                    }
                }
            }

            let next_nonce = get_nonce(&g_nonce);
            let out = hasher.hash_next(&next_nonce);

            if out.leading_zeros() >= difficulty {
                let solution = puzzle::PuzzleSolution::new(
                    g_nonce,
                    unit_id.into_bytes(),
                    nonce.to_vec(),
                    difficulty,
                );
                solutions.send(solution).unwrap();
            }

            nonce = next_nonce;
        }
    });
}
