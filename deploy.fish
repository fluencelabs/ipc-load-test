set -x IS_MOCKED_RANDOMX false
set -x CONTRACTS_ENV_NAME local
set -x MAX_PROOFS_PER_EPOCH 1000000
set -x EPOCH_DURATION 300
set -x DIFFICULTY 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
# set -x PRIVATE_KEY 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
set -x PRIVATE_KEY 0x(cat ~/.ipc/r0/ipc-node/node0/keys/validator_key.sk | base64 -d | xxd -p -c 256 -u)