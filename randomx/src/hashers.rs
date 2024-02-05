use blake3;
use tiny_keccak::{Hasher, Keccak, Sha3};

pub fn sha3_hasher(msg: &str) -> [u8; 32] {
    let mut hashed_message = [0; 32];
    let mut sha3 = Sha3::v256();
    sha3.update(msg.as_bytes());
    sha3.finalize(hashed_message.as_mut());
    hashed_message
}

pub fn keccak_hasher(bytes: &[u8]) -> [u8; 32] {
    let mut hashed_message = [0; 32];
    let mut keccak = Keccak::v256();
    keccak.update(bytes);
    keccak.finalize(hashed_message.as_mut());
    hashed_message
}

pub fn blake3_hasher(msg: &str) -> [u8; 32] {
    let hashed_message = blake3::hash(msg.as_bytes());
    hashed_message.as_bytes()[..32].try_into().unwrap()
}
