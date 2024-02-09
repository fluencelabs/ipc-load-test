use serde::{Deserialize, Deserializer};
use serde::de::{self, Visitor, SeqAccess};
use std::fmt;

#[derive(Deserialize, Debug, Clone)]
pub struct Request {
    #[serde(deserialize_with = "from_hex")]
    pub globalNonce: Vec<u8>,
    #[serde(deserialize_with = "from_hex_vec")]
    pub CUIds: Vec<Vec<u8>>,
}

fn from_hex<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
where
    D: Deserializer<'de>,
{
    let s: &str = Deserialize::deserialize(deserializer)?;
    hex::decode(s.trim_start_matches("0x")).map_err(serde::de::Error::custom)
}


fn from_hex_vec<'de, D>(deserializer: D) -> Result<Vec<Vec<u8>>, D::Error>
where
    D: Deserializer<'de>,
{
    struct HexVecVisitor;

    impl<'de> Visitor<'de> for HexVecVisitor {
        type Value = Vec<Vec<u8>>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a vector of hex strings")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: SeqAccess<'de>,
        {
            let mut buffer = Vec::new();

            while let Some(elem) = seq.next_element::<String>()? {
                let decoded = hex::decode(elem.trim_start_matches("0x"))
                    .map_err(de::Error::custom)?;
                buffer.push(decoded);
            }

            Ok(buffer)
        }
    }

    deserializer.deserialize_seq(HexVecVisitor)
}