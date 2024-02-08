import { ethers } from "ethers";
import { DealClient } from "@fluencelabs/deal-ts-clients";

import { loadConfig, saveConfig } from "./config.js";
import { delay } from "./utils.js";

const DEFAULT_CONFIRMATIONS = 1;

async function getDefaultOfferFixture(
  owner: string,
  paymentToken: string,
  timestamp: number
) {
  const offerFixture = {
    minPricePerWorkerEpoch: ethers.parseEther("0.01"),
    paymentToken: paymentToken,
    effectors: [
      {
        prefixes: "0x12345678",
        hash: ethers.encodeBytes32String("TestEffectorHash"),
      },
    ],
    peers: [
      {
        peerId: ethers.encodeBytes32String(`peerId0:${timestamp}`),
        unitIds: [ethers.encodeBytes32String(`unitId0:${timestamp}`)],
        owner: owner,
      },
    ],
  };

  return offerFixture;
}

const config = loadConfig("config.json");

const rpc = new ethers.JsonRpcProvider(config.test_rpc_url);
const signer = new ethers.Wallet(config.provider_sk, rpc);
const client = new DealClient(signer, "local");

console.log("Getting USDC token address...");
const paymentToken = await client.getUSDC();
const paymentTokenAddress = await paymentToken.getAddress();

console.log("Getting market contract...");
const market = await client.getMarket();

console.log("Getting signer address...");
const signerAddress = await signer.getAddress();

console.log("Getting block number and timestamp...");
const blockNumber = await rpc.getBlockNumber();
const timestamp = (await rpc.getBlock(blockNumber))!.timestamp;

const offer = await getDefaultOfferFixture(
  signerAddress,
  paymentTokenAddress,
  timestamp
);

console.log("Setting provider info...");
const setProviderInfoTx = await market.setProviderInfo(config.provider_name, {
  prefixes: "0x12345678",
  hash: ethers.encodeBytes32String(`${config.provider_name}:${timestamp}`),
});
await setProviderInfoTx.wait(DEFAULT_CONFIRMATIONS);

console.log("Registering market offer...");
const registerMarketOfferTx = await market.registerMarketOffer(
  offer.minPricePerWorkerEpoch,
  offer.paymentToken,
  offer.effectors,
  offer.peers
);
await registerMarketOfferTx.wait(DEFAULT_CONFIRMATIONS);

const capacity = await client.getCapacity();
const capacityMinDuration = await capacity.minDuration();

for (const peer of offer.peers) {
  // bytes32 peerId, uint256 duration, address delegator, uint256 rewardDelegationRate
  console.log(
    "Create commitment for peer: ",
    peer.peerId,
    " with duration: ",
    capacityMinDuration,
    "..."
  );

  const createCommitmentTx = await capacity.createCommitment(
    peer.peerId,
    capacityMinDuration,
    signerAddress,
    1
  );
  await createCommitmentTx.wait(DEFAULT_CONFIRMATIONS);
}

console.log("Get capacity commitment created events...");
// Fetch created commitmentIds from chain.
const filterCreatedCC = capacity.filters.CommitmentCreated;

const capacityCommitmentCreatedEvents = await capacity.queryFilter(
  filterCreatedCC,
  blockNumber
);
const capacityCommitmentCreatedEventsLast = capacityCommitmentCreatedEvents
  .reverse()
  .slice(0, offer.peers.length);
console.log(
  "Got",
  capacityCommitmentCreatedEventsLast.length,
  "capacity commitment created events for",
  offer.peers.length,
  "peers..."
);

const commitmentIds = capacityCommitmentCreatedEventsLast.map(
  (event) => event.args.commitmentId
);

let totalCollateral = BigInt(0);
for (const commitmentId of commitmentIds) {
  const commitment = await capacity.getCommitment(commitmentId);
  const collateralToApproveCommitment =
    commitment.collateralPerUnit * commitment.unitCount;
  console.log(
    "Collateral for commitmentId:",
    commitmentId,
    "=",
    collateralToApproveCommitment
  );
  totalCollateral += collateralToApproveCommitment;
}

console.log("Depositing collateral", totalCollateral, "...");
capacity.depositCollateral
const depositCollateralTx = await capacity.depositCollateral(commitmentIds, {
  value: totalCollateral,
});
await depositCollateralTx.wait(DEFAULT_CONFIRMATIONS);

const filterActivatedCC = capacity.filters.CommitmentActivated();
console.info("Waiting for commitment activated event...");
for (let i = 0; i < 10000; i++) {
  const capacityCommitmentActivatedEvents = await capacity.queryFilter(
    filterActivatedCC,
    blockNumber
  );

  if (capacityCommitmentActivatedEvents.length > 0) {
    console.info("Got commitment activated event...");
    break;
  } else {
    console.info("No commitment activated event...");
  }

  await delay(1000);
}

console.info("Updating config...");
saveConfig("config.json", { ...config, unit_id: offer.peers[0]?.unitIds[0] });

console.info("Unit ID: ", offer.peers[0]?.unitIds[0]);
