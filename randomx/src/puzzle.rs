use serde::{Deserialize, Serialize, Serializer};

#[derive(Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PuzzleType {
    ZEROS,
    // COMP,
}

#[derive(Serialize, Debug, Clone)]
pub struct PuzzleSolution {
    #[serde(serialize_with = "as_hex")]
    pub ch: Vec<u8>,
    #[serde(serialize_with = "as_hex")]
    pub g_nonce: Vec<u8>,
    #[serde(serialize_with = "as_hex")]
    pub unit_id: Vec<u8>,
    #[serde(serialize_with = "as_hex")]
    pub nonce: Vec<u8>,
    #[serde(serialize_with = "as_hex")]
    pub hash: Vec<u8>,
}

fn as_hex<S>(val: &[u8], serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let hex = "0x".to_owned() + &hex::encode(val);
    serializer.serialize_str(&hex)
}

impl PuzzleSolution {
    pub fn new(
        ch: Vec<u8>,
        g_nonce: Vec<u8>,
        unit_id: Vec<u8>,
        nonce: Vec<u8>,
        hash: Vec<u8>,
    ) -> Self {
        PuzzleSolution {
            ch,
            g_nonce,
            unit_id,
            nonce,
            hash,
        }
    }
}
