#! /usr/bin/env bash

# Generate genesis file
mkdir -p /files/fendermint
fendermint genesis --genesis-file /files/fendermint/genesis.json \
  new \
  --chain-name /rdev \
  --base-fee 100 \
  --timestamp 1680101412 \
  --power-scale 0

# Add validators as stand-alone accounts
for i in /keys/*; do
  fendermint genesis --genesis-file /files/fendermint/genesis.json \
    add-account \
    --public-key $i/validator.pk \
    --balance 1000000000000000000000 \
    --kind ethereum
done

# Add 4 validators with power=100 and rest with power=1
for i in /keys/*; do
  index="$(basename $i)"
  if (( $index <= 3 )); then
    power=100
  else
    power=1
  fi

  fendermint genesis --genesis-file /files/fendermint/genesis.json \
    add-validator \
    --public-key $i/validator.pk \
    --power $power
done

# Convert genesis file to cometbft format
mkdir -p /files/cometbft
fendermint genesis --genesis-file /files/fendermint/genesis.json \
  into-tendermint \
  --out /files/cometbft/genesis.json
