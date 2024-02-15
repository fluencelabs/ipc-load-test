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
export PRIVATE_KEY=0x$(cat ~/.ipc/r0/ipc-node/node0/keys/validator_key.sk | base64 -d | xxd -p -c 256 -u)
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
export EPOCH_DURATION=30
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

### Generate additional wallets

To work further, some wallets with eth will be needed. The following script will generate `n` addresses and transfer `50eth` to each from `PRIVATE_KEY`:

```bash
./gen_keys $PRIVATE_KEY <n>
```

### Update client config

Populate each `providers[i].sk` and `providers[i].peers.owner_sk` in `client/config.json` with secret keys of wallets obtained from the previous step.

### Register providers

This will register providers defined in `client/config.json`, create market offers and capacity commitments for them.

```bash
cd client
npm i
npm run register
```

### Make named pipes for client and prover communication

This is needed to exchange proof requests and solutions between js client and rust prover.

```bash
mkfifo /tmp/rust_to_js_pipe
mkfifo /tmp/js_to_rust_pipe
```

### Run client

This will start script that:
- Listens to chain events and updates `globalNonce`
- Requests proof solutions from prover
- On solution, submits it to the network
- **Prints proof submit statistics** every epoch

```bash
cd client
npm run send
```

### Run prover

This will start binary that:
- Listens to proof requests
- Sends back proof solutions

```bash
cd randomx
cargo run --release
```
