use hex;
use fluence_keypair::{key_pair::KeyFormat, public_key::PublicKey, signature::Signature};

use crate::hashers::keccak_hasher;
use crate::KEYPAIR as keypair;

// collection of methods for stuff that might com from chain, Nox, etc.

// sign with ed25519 using fluence-keypair crate. this might be done on Nox.
pub fn signer(msg: &Vec<u8>) -> [u8; 32] {
    let sig = keypair.sign(msg).unwrap();
    sig.to_vec()[..32].try_into().unwrap()
}

pub fn verify_sig(pk: &Vec<u8>, msg: &Vec<u8>, signature: Vec<u8>) -> bool {
    let sig = Signature::from_bytes(KeyFormat::Ed25519, signature);
    let priv_key = PublicKey::decode(pk).unwrap();
    match priv_key.verify(msg, &sig) {
        Ok(_) => true,
        Err(_) => false,
    }
}

// create unique thread ids which comes from FVM  and we expect that to be replaced either with the idx or the complete hash
// we use thread id to create verifiable (input) nonces for RandomX hashing
#[derive(Debug, PartialEq)]
pub struct ThreadId([u8;32]);

impl ThreadId {
    pub fn new(peer_id: &str, idx: &u32 ) -> Self {
        ThreadId(keccak_hasher(&format!("{}_{}", peer_id, idx)))
    }
    pub fn from_hex(hex_str: &str) -> Self {
        ThreadId(hex::decode(hex_str).unwrap()[..].try_into().unwrap())
    }
    pub fn to_hex(&self) -> String {
        hex::encode(&self.0)
    }

    pub fn to_vec(&self) -> Vec<u8> {
        let v = self.0[..].try_into();
        match v {
            Ok(v) => v,
            Err(_) => vec![],
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn threadid_test() {
        let peer_id = "keccak25";
        let idx = 6;
        let expected = "b877077c72f1852ab6edcf1ab688444ea047b2115419e7f03fe66f9947667cb9";
        let hashed = ThreadId::new(peer_id, &idx);
        assert_eq!(hashed, ThreadId::from_hex(expected));
    }
    #[test]
    fn thread_id_convo_test() {
        let peerid = "peerid";
        let thread_num = 5u32;
        let tid = ThreadId::new(peerid, &thread_num);
        assert!(tid.0.len()==32);
        assert!(tid.to_hex().len()==64);
    }
}