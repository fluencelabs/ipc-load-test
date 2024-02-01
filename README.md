# Fluence on IPC load test

## Deploying local testnet

### Prerequisites

Install [IPC prerequisites](https://github.com/fluencelabs/ipc/blob/fluence/README.md#prerequisites).

### Init submodules

```bash
git submodule update --init --recursive
```

### Build Fendermint Docker image

```bash
cd ipc/fendermint
make BUILD_TAG=fendermint:fluence docker-build
```

NOTE: `fendermint:fluence` image is implicitly used in next steps.

### Start local testnet

```bash
cd ipc
cargo make --profile fluence --makefile infra/fendermint/Makefile.toml testnet
```

This will create 4 IPC nodes. ETH API of node `n` (starting from `0`) is accessible at `0.0.0.0:854<5 + n>`.

Configuration related to network is located in `~/.ipc/r0/ipc-node` (`r0` is a default IPC subnet name).

NOTE: To stop local testnet run
```bash
cargo make --profile fluence --makefile infra/fendermint/Makefile.toml testnet-down
```

### Obtain a key

To deploy contracts, a key of an account with some ETH is required. A key of a validator created by default can be obtained as follows:

```bash
PRIVATE_KEY=0x$(cat ~/.ipc/r0/ipc-node/node0/keys/validator_key.sk | base64 -d | xxd -p -c 256 -u)
```

### Deploy contracts

```bash
cd deal
# Build contracts
make build-contracts 
# Deploy contracts
CONTRACTS_ENV_NAME=local forge script script/Deploy.s.sol \
    --rpc-url local \
    --skip-simulation \
    --private-key $PRIVATE_KEY \
    --broadcast \
    --slow
```

NOTE: `--slow` is required to work around transaction reordering in Fendermint ETH API.

### Build ts-client

```bash
# Build ts-client after deploy
make install-npms
make build-ts-client
```

NOTE: This will update contracts addresses in ts-client from deploy info.

