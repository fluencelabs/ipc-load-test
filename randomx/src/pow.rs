use chrono::Utc;
use crossbeam::channel::{Receiver, Sender};
use rust_randomx::{Context, Hasher};
use std::sync::Arc;
use std::thread;

use crate::hashers;
use crate::puzzle;

#[derive(Clone)]
pub enum Event {
    GNonce(Vec<u8>),
    Difficulty(Vec<u8>),
    UnitId(Vec<u8>),
    Stop,
}

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

pub fn randomx_instance(
    events: Receiver<Event>,
    solutions: Sender<puzzle::PuzzleSolution>,
) -> thread::JoinHandle<()> {
    return thread::spawn(move || {
        let mut g_nonce: Vec<u8> = vec![];
        let mut difficulty = 256;
        let mut unit_id: Vec<u8> = vec![];

        let (mut ch, mut hasher) = construct_hasher(&g_nonce, &unit_id);

        let mut nonce = get_nonce();
        hasher.hash_first(&nonce);

        loop {
            while let Ok(ev) = events.try_recv() {
                match ev {
                    Event::GNonce(g) => {
                        log::info!("Received g_nonce: {:?}", g);
                        g_nonce = g;
                        let (mut ch, mut hasher) = construct_hasher(&g_nonce, &unit_id);
                        hasher.hash_first(&get_nonce());
                    }
                    Event::Difficulty(d) => {
                        log::info!("Received difficulty: {:?}", d);
                        difficulty = 0;
                    }
                    Event::UnitId(u) => {
                        log::info!("Received unit_id: {:?}", u);
                        unit_id = u;
                        let (mut ch, mut hasher) = construct_hasher(&g_nonce, &unit_id);
                        hasher.hash_first(&get_nonce());
                    }
                    Event::Stop => {
                        return;
                    }
                }
            }

            let next_nonce = get_nonce();
            let out = hasher.hash_next(&next_nonce);

            // Skip uninitialized solutions
            // Do not check difficulty
            if
            /*out.leading_zeros() >= difficulty &&*/
            unit_id.len() > 0 && g_nonce.len() > 0 {
                let solution = puzzle::PuzzleSolution::new(
                    ch.to_vec(),
                    g_nonce.clone(),
                    unit_id.clone(),
                    nonce.to_vec(),
                    out.as_ref().to_vec(),
                );
                log::info!(
                    "Found solution with difficulty {:?} found: {:?}",
                    difficulty,
                    solution
                );
                solutions.send(solution).unwrap();
            }

            nonce = next_nonce;
        }
    });
}
