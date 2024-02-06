use serde::{Deserialize, Deserializer};

#[derive(Deserialize, Debug, Clone)]
pub struct Request {
    #[serde(deserialize_with = "from_hex")]
    pub globalNonce: Vec<u8>,
    #[serde(deserialize_with = "from_hex")]
    pub unitId: Vec<u8>,
    pub n: u32,
}

fn from_hex<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
where
    D: Deserializer<'de>,
{
    let s: &str = Deserialize::deserialize(deserializer)?;
    hex::decode(s.trim_start_matches("0x")).map_err(serde::de::Error::custom)
}