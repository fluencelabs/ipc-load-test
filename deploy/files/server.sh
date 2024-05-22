#!/usr/bin/env bash
cat <<CONFIG >/opt/consul/config.d/server.json
{
  "server": true,
  "bootstrap_expect": 3,
  "ui_config": {
    "metrics_provider": "prometheus",
    "metrics_proxy": {
      "base_url": "http://prometheus.service.consul:9090"
    }
  },
  "default_intention_policy": "deny",
  "config_entries": {
    "bootstrap": [
      {
        "kind": "proxy-defaults",
        "name": "global",
        "config": {
          "protocol": "http",
          "envoy_prometheus_bind_addr": "0.0.0.0:9102"
        }
      }
    ]
  }
}
CONFIG

cat <<CONFIG >/opt/consul/config.d/consul.json
{
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

systemctl restart systemd-journald
systemctl start consul
systemctl start nomad

cat <<POOL >/tmp/servers.pool
node_pool "servers" {}
POOL
nomad node pool apply /tmp/servers.pool || true
