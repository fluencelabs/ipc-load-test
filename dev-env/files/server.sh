#!/usr/bin/env bash
cat <<CONFIG >/opt/consul/config.d/server.json
{
  "server": true,
  "bootstrap_expect": 3
}
CONFIG

cat <<CONFIG >/opt/consul/config.d/consul.json
{
  "datacenter": "${workspace}",
  "retry_join": [
    "servers.${workspace}.fluence.dev"
  ]
}
CONFIG

cat <<CONFIG >/opt/nomad/config.d/server.json
{
  "server": {
    "enabled": true,
    "bootstrap_expect": 3,
    "raft_protocol": 3,
    "default_scheduler_config": {
      "memory_oversubscription_enabled": true
    }
  },
  "client": {
    "node_pool": "servers"
  }
}
CONFIG

cat <<CONFIG >/opt/nomad/config.d/nomad.json
{
  "region": "${workspace}",
  "datacenter": "dc1"
}
CONFIG

cat <<CONFIG >/opt/nomad/config.d/kadalu.json
{
  "client": {
    "host_volume": [
      {
        "seaweedfs-master": {
          "path": "/var/lib/seaweedfs-master"
        }
      },
      {
        "seaweedfs-volume": {
          "path": "/var/lib/seaweedfs-volume"
        }
      },
      {
        "postgres": {
          "path": "/var/lib/postgres"
        }
      }
    ]
  }
}
CONFIG

mkdir -p /var/lib/seaweedfs-master /var/lib/seaweedfs-volume /var/lib/postgres

systemctl restart systemd-journald
systemctl start consul
systemctl start nomad

cat <<POOL >/tmp/servers.nomad.hcl
node_pool "servers" {}
POOL
nomad node pool apply /tmp/servers.nomad.hcl || true
