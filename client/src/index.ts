import { ethers } from "ethers";
import { DealClient } from "@fluencelabs/deal-ts-clients";

import { Communicate } from "./communicate.js";

const DEFAULT_CONFIRMATIONS = 1;

const TEST_RPC_URL = "http://127.0.0.1:8548";
const PROVIDER_SK =
  "0xdc65877f37e6ca4f7f3f4b083c276177c03bb70d2032c8e0ef4190f72670fabe";
const PROVIDER_NAME = "TEST_PROVIDER";

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const communicate = new Communicate();

communicate.onSolution((solution: any) => {
  console.log("Got solution: ", solution);
});

for (let i = 0; i < 10; i++) {
  console.log("Setting difficulty and global nonce...");

  communicate.setDifficulty("0x" + i.toString(16));
  communicate.setGlobalNonce("0x" + i.toString(16));

  await delay(60000);
}

const rpc = new ethers.JsonRpcProvider(TEST_RPC_URL);
const signer = new ethers.Wallet(PROVIDER_SK, rpc);
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
const setProviderInfoTx = await market.setProviderInfo(PROVIDER_NAME, {
  prefixes: "0x12345678",
  hash: ethers.encodeBytes32String(`${PROVIDER_NAME}:${timestamp}`),
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
const capacityAddress = await capacity.getAddress();
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
let collateralToApproveCommitments = 0n;
for (const commitmentId of commitmentIds) {
  const commitment = await capacity.getCommitment(commitmentId);
  const collateralToApproveCommitment =
    commitment.collateralPerUnit * commitment.unitCount;
  console.log(
    "Collateral for commitmentId: ",
    commitmentId,
    " = ",
    collateralToApproveCommitment,
    "..."
  );
  collateralToApproveCommitments += collateralToApproveCommitment;
}
console.info(
  "Sending approve of FLT for all commitments for value:",
  collateralToApproveCommitments,
  "..."
);

const fltContract = await client.getFLT();
const collateralToApproveCommitmentsTx = await fltContract.approve(
  capacityAddress,
  collateralToApproveCommitments
);
await collateralToApproveCommitmentsTx.wait(DEFAULT_CONFIRMATIONS);

console.log("Get global nonce...");
const globalNonce = await capacity.getGlobalNonce();

console.log("Get difficulty...");
const difficulty = await capacity.difficulty();

console.log("Global nonce: ", globalNonce);
console.log("Peer PeerID: ", offer.peers[0]?.peerId);
console.log("Peer UnitID: ", offer.peers[0]?.unitIds[0]);
console.log("Difficulty: ", difficulty);
