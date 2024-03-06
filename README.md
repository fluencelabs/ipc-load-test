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
cd ipc/infra/fendermint
cargo make --profile fluence --makefile ./Makefile.toml testnet
```

This will create 7 IPC nodes. ETH API of node `n` (starting from `0`) is accessible at `0.0.0.0:854<5 + n>`.

Configuration related to network is located in `~/.ipc/r0/ipc-node` (`r0` is a default IPC subnet name).

NOTE: To stop local testnet run

```bash
cargo make --profile fluence --makefile ./Makefile.toml testnet-down
```

### Obtain a key

To deploy contracts, a key of an account with some ETH is required. A key of a validator created by default can be obtained as follows:

```bash
PRIVATE_KEY=0x$(cat ~/.ipc/r0/ipc-node/node0/keys/validator_key.sk | base64 -d | xxd -p -c 256 -u)
```

### Deploy contracts

First of all: build contracts:

```bash
cd deal
make build-contracts
```

Before deploying contracts, set some additional env parameters:

```bash
# Use real RandomX
export IS_MOCKED_RANDOMX=false
export CONTRACTS_ENV_NAME=local
# Do not limit max proofs per epoch
export MAX_PROOFS_PER_EPOCH=1000000
# Set epoch duration (in seconds)
export EPOCH_DURATION=300
# Set no difficulty (32 * "FF" = 32 bytes)
export DIFFICULTY=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
```

Deploy contracts with:

```bash
forge script script/Deploy.s.sol \
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

NOTE: This will update contracts addresses in ts-client from deployment info.

### Run prover

Make directory for capacity commitment prover state (path to it is specified in `ccp_config.toml`):

```bash
mkdir ./ccp_state
```

Run prover:

```bash
cd ccp
CCP_LOG=trace cargo run --release -p ccp-main ../ccp_config.toml
```

### Run test

Ensure that `PRIVATE_KEY` is still set as an environment variable, then run:

```bash
cd client
npm i
npm run run
```

This will start script that:

- Creates wallets for providers and peers and adds funds to them
- Registers providers each with one peer and one CU
- Listens to chain events and updates `globalNonce` in prover through JSON RPC
- Requests proof solutions from prover through JSON RPC
- On solution, submits it to the network
- Prints proof submit statistics
- Collects proof submit statistics and dumps them to `client/metrics.json` file each minute
