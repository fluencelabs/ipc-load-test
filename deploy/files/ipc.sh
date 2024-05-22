#!/usr/bin/env bash

cat <<CONFIG >/opt/consul/config.d/consul.json
{
  "retry_join": [
    "servers.${workspace}.fluence.dev"
  ]
}
CONFIG

cat <<CONFIG >/opt/nomad/config.d/nomad.json
{
  "region": "${workspace}",
  "datacenter": "dc1"
}
CONFIG

cat <<CONFIG >/opt/nomad/config.d/ipc.json
{
  "client": {
    "node_pool": "ipc",
    "host_volume": [
      {
        "cometbft": {
          "path": "/var/lib/cometbft"
        }
      },
      {
        "fendermint": {
          "path": "/var/lib/fendermint"
        }
      }
    ],
    "meta": {
      "ipc_node_index": ${index}
    }
  }
}
CONFIG

mkdir -p /var/lib/cometbft /var/lib/fendermint

systemctl restart systemd-journald
systemctl start consul
systemctl start nomad

cat <<POOL >/tmp/ipc.pool
node_pool "ipc" {
  description = "For running IPC"
}
POOL
nomad node pool apply /tmp/ipc.pool || true
