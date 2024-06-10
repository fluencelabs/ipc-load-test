# Fluence on IPC load test

## Init submodules

Project in this repo have submodules, so don't forget to init them.

```bash
git submodule update --init --recursive
```

## Deploy testnet

## [Option 1]: Deploy local testnet

### Prerequisites

Install [IPC prerequisites](https://github.com/fluencelabs/ipc/blob/fluence/README.md#prerequisites).

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

This will create `TESTNET_NODES_NUMBER` IPC nodes. ETH API of node `n` (starting from `0`) is accessible at `0.0.0.0:854<5 + n>`.

Configuration related to network is located in `~/.ipc/r0/ipc-node` (`r0` is a default IPC subnet name).

NOTE: To stop local testnet run

```bash
cargo make --profile fluence --makefile ./Makefile.toml testnet-down
```

NOTES:

- To modify number of nodes in local testnet, set `TESTNET_NODES_NUMBER` in `ipc/infra/fendermint/Makefile.toml`
- To modify `Cpuset` property of nodes containers, use `ipc/infra/fendermint/run.sh` and `ipc/infra/fendermint/docker-compose.yml`

### Obtain a key

To deploy contracts, a key of an account with some ETH is required. A key of a validator created by default can be obtained as follows:

```bash
PRIVATE_KEY=0x$(cat ~/.ipc/r0/ipc-node/node0/keys/validator_key.sk | base64 -d | xxd -p -c 256 -u)
```

## [Option 2]: Deploy ephemeral testnet

Just open PR in this repository and add a `dev-create` tag to it.

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
# Set no difficulty (32 * "FF" = 32 bytes)
export DIFFICULTY=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
```

Set `rpc_endpoints.local` to your eth-api address in `deal/foundry.toml`.

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

Then build ts-client for contracts:

```bash
# Build ts-client after deploy
make install-npms
make build-ts-client
```

NOTE: This will update contracts addresses in ts-client from deployment info.

### Run prover

Run prover:

```bash
cd ccp
CCP_LOG=info cargo run --release -p ccp-main ../ccp_config.toml
```

NOTE: If you rerun the test, it is better to clean CCP state:

```bash
rm -rf ../ccp_state
```

### Run test

First of all, set address of your eth-api in function `ETH_API_URL` in `client/src/const.ts`.

Then, review the test parameters in `client/src/index.ts`:
- `interval` - interval in millisconds between sending batches
- `cusNumber` - number of CUs requested from CCP (script does not enforces distribution of proofs in one batch)
- `sendersNumber` - number of unique wallets to send batches with, they are used in turn
- `batchSize` - size of each batch
- `batchesToSend` - how many batches to send for the test

Finally, ensure that `PRIVATE_KEY` is still set as an environment variable, then run:

```bash
cd client
npm i
npm run run
```

This will start script that:

- Creates wallets for senders adds funds to them. It is done on the first run, then file `client/config.json` is created with all the wallets. This file is read again on consequent runs. **Important:** Remove `client/config.json` if you want to regenerate wallets (e.g. after testnet restart)
- Requests proof solutions from prover through JSON RPC, gathers them into batches
- Sends batches using next sender in turn each `interval` milliseconds
- Collects proof submit statistics and dumps them to `client/metrics.json` file

NOTE: By default, script instructs CCP to use `4 + idx`th physical core for provider `idx`. To change that, modify `cu_allocation` variable in `client/src/index.ts`

