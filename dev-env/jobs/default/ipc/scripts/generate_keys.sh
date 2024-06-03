#! /usr/bin/env bash
for i in {0..11}; do
  mkdir keys/$i -p
  address=$(docker run --rm -e FM_NETWORK=test --user ${UID} -v ./ipc-cli:/ipc ghcr.io/consensus-shipyard/fendermint ipc-cli --config-path /ipc/config.toml wallet new --wallet-type evm | tr -d \")
  public=$(docker run --rm -e FM_NETWORK=test --user ${UID} -v ./ipc-cli:/ipc ghcr.io/consensus-shipyard/fendermint ipc-cli --config-path /ipc/config.toml wallet pub-key --wallet-type evm --address ${address})
  private=$(docker run --rm -e FM_NETWORK=test --user ${UID} -v ./ipc-cli:/ipc -v ./keys/:/keys ghcr.io/consensus-shipyard/fendermint ipc-cli --config-path /ipc/config.toml wallet export --wallet-type evm --address $address --hex)
  echo $address > ./keys/$i/address
  echo $public > ./keys/$i/validator.pk.hex
  echo $private > ./keys/$i/validator.sk.hex
  docker run --rm -e FM_NETWORK=test --user ${UID} -v ./keys/$i:/keys ghcr.io/consensus-shipyard/fendermint key gen --out-dir /keys/ --name fendermint
  docker run --rm -e FM_NETWORK=test --user ${UID} -v ./keys/$i:/keys ghcr.io/consensus-shipyard/fendermint key eth-to-fendermint --secret-key /keys/validator.sk.hex --name validator --out-dir /keys
  docker run --rm -e FM_NETWORK=test --user ${UID} -v ./keys/$i:/keys ghcr.io/consensus-shipyard/fendermint key into-tendermint --secret-key /keys/validator.sk --out /keys/priv_validator_key.json
  docker run --rm -e FM_NETWORK=test --user ${UID} -v ./keys/$i:/keys ghcr.io/consensus-shipyard/fendermint key show-peer-id --public-key /keys/fendermint.pk > ./keys/$i/fendermint.id

  temp_dir=$(mktemp -d)
  docker run --rm -e FM_NETWORK=test --user ${UID} --entrypoint cometbft -v $temp_dir:/cometbft cometbft/cometbft:v0.37.x init
  docker run --rm -e FM_NETWORK=test --user ${UID} --entrypoint cometbft -v $temp_dir:/cometbft cometbft/cometbft:v0.37.x show-node-id > $temp_dir/cometbft.id
  mv $temp_dir/cometbft.id ./keys/$i/
  mv $temp_dir/config/node_key.json ./keys/$i/
  rm -rf $temp_dir
done
