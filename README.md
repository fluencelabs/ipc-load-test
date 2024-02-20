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

### Generate additional wallets

To work further, some wallets with eth will be needed. The following script will generate `n` addresses and transfer `50eth` to each from `PRIVATE_KEY`:

```bash
./gen_keys.sh $PRIVATE_KEY <n>
```

### Update client config

Populate each `providers[i].sk` and `providers[i].peers.owner_sk` in `client/config.json` with secret keys of wallets obtained from the previous step. Modify config according to your needs: add or delete providers, peers, CUs.

### Register providers

This will register providers defined in `client/config.json`, create market offers and capacity commitments for them.

```bash
cd client
npm i
npm run register
```

### Run prover

Make directories for capacity commitment prover:

```bash
mkdir ./ccp_proofs
mkdir ./ccp_persistent
```

Run prover:

```bash
cd ccp
RUST_LOG=trace cargo run --release -p ccp-main -- \
                         --bind-address 127.0.0.1:9383 \
                         --threads-per-physical-core 3 \
                         --dir-to-store-proofs ../ccp_proofs \
                         --dir-to-store-persistent-state ../ccp_persistent \
                         --utility-core-id 8 \
                         --tokio-core-id 8
```

### Run client

This will start script that:

- Listens to chain events and updates `globalNonce`
- Requests proof solutions from prover through JSON RPC on `127.0.0.1:9383`
- On solution, submits it to the network
- **Prints proof submit statistics**

```bash
cd client
npm run send
```

NOTE: This uses config populated by `npm run register`.
