use serde::{Serialize, Serializer};

#[derive(Serialize, Debug, Clone)]
pub struct Solution {
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

impl Solution {
    pub fn new(
        ch: Vec<u8>,
        g_nonce: Vec<u8>,
        unit_id: Vec<u8>,
        nonce: Vec<u8>,
        hash: Vec<u8>,
    ) -> Self {
        Solution {
            ch,
            g_nonce,
            unit_id,
            nonce,
            hash,
        }
    }
}
