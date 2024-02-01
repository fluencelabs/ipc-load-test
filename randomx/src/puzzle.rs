use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PuzzleType {
    ZEROS,
    // COMP,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PuzzleSolution {
    pub g_nonce: u64,
    pub unit_id: Vec<u8>,
    pub nonce: Vec<u8>,
    pub difficulty: u32,
}

impl PuzzleSolution {
    pub fn new(g_nonce: u64, unit_id: Vec<u8>, nonce: Vec<u8>, difficulty: u32) -> Self {
        PuzzleSolution {
            g_nonce,
            unit_id,
            nonce,
            difficulty,
        }
    }
}
