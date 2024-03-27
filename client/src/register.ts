import { ethers } from "ethers";
import { DealClient } from "@fluencelabs/deal-ts-clients";

import { type ProviderConfig } from "./config.js";
import { DEFAULT_CONFIRMATIONS } from "./const.js";

// NOTE: Modifies provider config in place
async function setupOffer(
  provider: ProviderConfig,
  paymentToken: string,
  timestamp: number
) {
  // Setup cu_ids for each peer.
  provider.peers.forEach((peer, pid) => {
    peer.cu_ids = [];
    for (let i = 0; i < peer.cu_count; i++) {
      peer.cu_ids.push(
        ethers.encodeBytes32String(
          `${provider.name}:p${pid}:u${i}:${timestamp}`
        )
      );
    }
  });

  const peers = provider.peers.map((peer, pid) => {
    const addr = new ethers.Wallet(peer.owner_sk).address;
    return {
      peerId: ethers.encodeBytes32String(
        `${provider.name}:p${pid}:${timestamp}`
      ),
      unitIds: peer.cu_ids,
      owner: addr,
    };
  });

  return {
    minPricePerWorkerEpoch: ethers.parseEther("0.01"),
    paymentToken: paymentToken,
    effectors: [
      {
        prefixes: "0x12345678",
        hash: ethers.encodeBytes32String("TestEffectorHash"),
      },
    ],
    peers,
    minProtocolVersion: 1,
    maxProtocolVersion: 1,
  };
}

// NOTE: Modifies provider config in place
export async function registerProvider(
  rpc: ethers.JsonRpcProvider,
  provider: ProviderConfig
) {
  console.log("Registering provider:", provider.name, "...");
  const prefix = `REG ${provider.name}:`;

  const signer = new ethers.Wallet(provider.sk, rpc);
  const client = new DealClient(signer, "local");

  console.log("Getting USDC token address...");
  const paymentToken = await client.getUSDC();
  const paymentTokenAddress = await paymentToken.getAddress();

  console.log(prefix, "Getting market contract...");
  const market = await client.getMarket();

  console.log(prefix, "Getting signer address...");
  const signerAddress = await signer.getAddress();

  console.log(prefix, "Getting block number and timestamp...");
  const blockNumber = await rpc.getBlockNumber();
  const timestamp = (await rpc.getBlock(blockNumber))!.timestamp;

  console.log(
    prefix,
    "Timestamp:",
    timestamp,
    "Block number:",
    blockNumber,
    "..."
  );

  const offer = await setupOffer(provider, paymentTokenAddress, timestamp);

  console.log(prefix, "Setting provider info...");
  const setProviderInfoTx = await market.setProviderInfo(provider.name, {
    prefixes: "0x12345678",
    hash: ethers.encodeBytes32String(`${provider.name}:${timestamp}`),
  });
  await setProviderInfoTx.wait(DEFAULT_CONFIRMATIONS);

  console.log(prefix, "Registering market offer...");
  const registerMarketOfferTx = await market.registerMarketOffer(
    offer.minPricePerWorkerEpoch,
    offer.paymentToken,
    offer.effectors,
    offer.peers,
    offer.minProtocolVersion,
    offer.maxProtocolVersion
  );
  await registerMarketOfferTx.wait(DEFAULT_CONFIRMATIONS);

  const core = await client.getCore();
  const vestingDuration = await core.vestingPeriodDuration();
  const vestingCount = await core.vestingPeriodCount();
  const LONG_TERM_DURATION = vestingDuration * vestingCount + 1n;

  const capacity = await client.getCapacity();
  for (const peer of offer.peers) {
    console.log(
      prefix,
      "Create commitment for peer:",
      peer.peerId,
      "with duration:",
      LONG_TERM_DURATION,
      "..."
    );

    const createCommitmentTx = await capacity.createCommitment(
      peer.peerId,
      LONG_TERM_DURATION,
      signerAddress,
      1
    );
    await createCommitmentTx.wait(DEFAULT_CONFIRMATIONS);
  }

  console.log(prefix, "Get capacity commitment created events...");
  // Fetch created commitmentIds from chain.
  const filterCreatedCC = capacity.filters.CommitmentCreated;

  const peerIds = offer.peers.map((peer) => peer.peerId.toLowerCase());
  const capacityCommitmentCreatedEvents = await capacity.queryFilter(
    filterCreatedCC,
    blockNumber
  );
  const capacityCommitmentCreatedEventsLast = capacityCommitmentCreatedEvents
    .reverse()
    .filter((ev) => peerIds.includes(ev.args.peerId.toLowerCase()))
    .slice(0, offer.peers.length);
  console.log(
    prefix,
    "Got",
    capacityCommitmentCreatedEventsLast.length,
    "capacity commitment created events for",
    offer.peers.length,
    "peers..."
  );

  const commitmentIds = capacityCommitmentCreatedEventsLast.map(
    (ev) => ev.args.commitmentId
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

  console.log(prefix, "Depositing collateral", totalCollateral, "...");
  const depositCollateralTx = await capacity.depositCollateral(commitmentIds, {
    value: totalCollateral,
  });
  await depositCollateralTx.wait(DEFAULT_CONFIRMATIONS);
  console.log(prefix, "Deposited collateral for", provider.name, "...");

  // FIXME: Wait for commitment activated event
  /*
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
    */
}
