import type { ProviderConfig } from "./config.js";
import type { LabelValue, Metrics } from "./metrics.js";
import type { Peer } from "./peer.js";

export function logStats(
  metrics: Metrics,
  providers: ProviderConfig[],
  peers: Peer[],
  passedMs: number,
  passedEpoches: number,
  proofsCount: number
) {
  console.log("Passed: ", passedMs / 1000, "s");
  console.log("Passed: ", passedEpoches, "epoches");

  console.log(
    "Success requests:",
    metrics
      .filter({
        status: (s) => s === "success",
        action: (a) => a === "send",
      })
      .count()
  );

  console.log("Proofs since last log:", proofsCount);

  for (const provider of providers) {
    console.log("Provider", provider.name);
    const providerMetrics = metrics.filter({
      provider: (p) => p === provider.name,
    });
    for (const peer of provider.peers) {
      const p = peers.find((p) => p.is(peer.owner_sk));
      const pBlock = p?.getBlock();
      const pEpoch = p?.getEpoch();
      console.log(
        "\tPeer",
        peer.owner_sk,
        "\tProofs:",
        p!.proofs(),
        "\tBatches:",
        p!.batches(),
        "\tEpoch:",
        pEpoch,
        "\tBlock:",
        pBlock
      );
      const peerMetrics = providerMetrics.filter({
        peer: (p) => p === peer.owner_sk,
      });
      for (const cu_id of peer.cu_ids) {
        const cu_id_str = cu_id.toString();
        const cu_value = (cus: LabelValue): number | undefined =>
          typeof cus === "object" &&
          cus &&
          cu_id_str in cus &&
          typeof cus[cu_id_str] === "number"
            ? (cus[cu_id_str] as number)
            : undefined;
        const cuMetrics = peerMetrics.filter({
          cus: (cus) => cu_value(cus) !== undefined,
        });
        const count = (s: string) =>
          cuMetrics
            .filter({ status: (ms) => ms === s })
            .gather("cus", cu_value)
            .reduce((acc, val) => acc + val, 0);
        const count_est = (s: string) =>
          cuMetrics
            .filter({
              status: (ms) => ms === s,
              action: (a) => a === "estimate",
            })
            .gather("cus", cu_value)
            .reduce((acc, val) => acc + val, 0);
        const count_send = (s: string) =>
          cuMetrics
            .filter({
              status: (ms) => ms === s,
              action: (a) => a === "send",
            })
            .gather("cus", cu_value)
            .reduce((acc, val) => acc + val, 0);
        const success_est = count_est("success");
        const success_send = count_send("success");
        const confirmed = count("confirmed");
        const error_est = count_est("error");
        const error_send = count_send("error");
        const invalid = count_est("invalid");
        const not_started = count_est("not_started");
        const not_active = count_est("not_active");
        const total =
          success_est + error_est + invalid + not_started + not_active;
        console.log(
          "\t\tCU",
          cu_id,
          "\tS",
          `${success_est}|${success_send}`,
          "\tC",
          confirmed,
          "\tI",
          invalid,
          "\tNS",
          not_started,
          "\tNA",
          not_active,
          "\tE",
          `${error_est}|${error_send}`,
          "\tT",
          total
        );
      }
    }
  }
}
