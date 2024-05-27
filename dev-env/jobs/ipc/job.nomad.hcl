locals {
  cometbft   = "cometbft/cometbft:v0.37.x"
  fendermint = "fluencelabs/fendermint:fluence-batching-actor"
  network    = "testnet"
}

variable "workspace" {
  type = string
}

job "ipc" {
  datacenters = [
    "*",
  ]
  type      = "system"
  node_pool = "ipc"

  group "validators" {
    ephemeral_disk {
      size    = 500
      sticky  = true
      migrate = true
    }

    volume "cometbft" {
      type   = "host"
      source = "cometbft"
    }

    volume "fendermint" {
      type   = "host"
      source = "fendermint"
    }

    network {
      mode = "bridge"

      dns {
        servers = ["172.17.0.1"]
      }

      port "cometbft-rpc" {
        to     = 26657
        static = 26657
      }

      port "cometbft-p2p" {
        to     = 26656
        static = 26656
      }

      port "cometbft-metrics" {}

      port "cometbft-health" {}

      port "fendermint-abci" {
        to = 26658
      }

      port "fendermint-p2p" {
        to     = 26659
        static = 26659
      }

      port "fendermint-metrics" {}

      port "eth-api" {
        to           = 8545
        static       = 8545
        host_network = "public"
      }

      port "promtail" {}

      port "envoy" {
        to = 9102
      }
    }

    service {
      name = "cometbft"
      port = "cometbft-rpc"
      tags = [
        "traefik.enable=true",
        "traefik.consulcatalog.connect=true",
        "traefik.http.routers.cometbft.entrypoints=https",
        "traefik.http.routers.cometbft.rule=Host(`cometbft.${var.workspace}.fluence.dev`)",
      ]

      check {
        name     = "cometbft health"
        port     = "cometbft-health"
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "1s"
      }

      meta {
        envoy = NOMAD_HOST_PORT_envoy
      }

      connect {
        sidecar_service {
          proxy {
            local_service_port = 26657
            config {
              protocol           = "http"
              connect_timeout_ms = 30000
            }

            expose {
              path {
                path            = "/health"
                protocol        = "http"
                local_path_port = 26657
                listener_port   = "cometbft-health"
              }
            }
          }
        }
      }
    }

    task "fendermint" {
      driver = "docker"

      volume_mount {
        volume      = "fendermint"
        destination = "/data"
      }

      service {
        name = "fendermint-p2p-${meta.ipc_node_index}"
        port = "fendermint-p2p"
      }

      service {
        name = "fendermint-metrics"
        port = "fendermint-metrics"

        meta {
          instance = "fendermnit-${meta.ipc_node_index}"
        }
      }

      resources {
        cpu        = 3000
        memory     = 4000
        memory_max = 5000
      }

      config {
        image      = local.fendermint
        force_pull = true

        ports = [
          "fendermint-p2p",
        ]
      }

      template {
        data        = <<-EOH
        FM_DATA_DIR="/data"
        FM_CONFIG_DIR="/fendermint/config"
        FM_SNAPSHOTS_DIR="/data/snapshots"
        FM_VALIDATOR_KEY__PATH="/secrets/validator.sk"
        FM_VALIDATOR_KEY__KIND="ethereum"

        FM_METRICS__ENABLED=true
        FM_METRICS__LISTEN__HOST=0.0.0.0
        FM_METRICS__LISTEN__PORT={{ env "NOMAD_PORT_fendermint_metrics" }}

        FM_TENDERMINT_RPC_URL='http://127.0.0.1:{{ env "NOMAD_PORT_cometbft_rpc" }}'
        FM_RESOLVER__CONNECTION__LISTEN_ADDR='/ip4/0.0.0.0/tcp/{{ env "NOMAD_PORT_fendermint_p2p" }}'
        FM_ABCI__LISTEN__PORT={{ env "NOMAD_PORT_fendermint_abci" }}
        FM_RESOLVER__CONNECTION__EXTERNAL_ADDRESSES='/ip4/{{ env "NOMAD_IP_fendermint_p2p" }}/tcp/{{ env "NOMAD_PORT_fendermint_p2p" }}'

        FM_LOG_LEVEL="debug"

        FM_NETWORK="${local.network}"
        FM_CHAIN_NAME="/rdev"

        FM_SNAPSHOTS__ENABLED=true
        FM_SNAPSHOTS__BLOCK_INTERVAL=10
        FM_SNAPSHOTS__HIST_SIZE=10
        FM_SNAPSHOTS__CHUNK_SIZE_BYTES=1048576
        FM_SNAPSHOTS__SYNC_POLL_INTERVAL=10

        # General settings
        FM_HOME_DIR="/local"
        FM_CONTRACTS_DIR="/fendermint/contracts"
        FM_BUILTIN_ACTORS_BUNDLE="/fendermint/bundle.car"
        FM_CUSTOM_ACTORS_BUNDLE="/fendermint/custom_actors_bundle.car"

        # ABCI
        FM_ABCI__LISTEN__HOST="127.0.0.1"

        # Peer discovery
        FM_RESOLVER__NETWORK__LOCAL_KEY="/local/fendermint.sk"
        {{ $port := env "NOMAD_PORT_fendermint_p2p" -}}
        {{- $id := key "jobs/ipc/keys/0/fendermint.id" -}}
        FM_RESOLVER__DISCOVERY__STATIC_ADDRESSES={{ printf "/dns4/fendermint-p2p-0.service.consul/tcp/%s/p2p/%s" $port $id }}
        EOH
        destination = "local/config.env"
        env         = true
      }

      template {
        data        = <<-EOH
        {{- key "jobs/ipc/fendermint/genesis.json" -}}
        EOH
        destination = "local/genesis.json"
        change_mode = "noop"
      }

      template {
        data        = <<-EOH
        {{- key (env "meta.ipc_node_index" | printf "jobs/ipc/keys/%s/validator.sk") -}}
        EOH
        destination = "secrets/validator.sk"
      }

      template {
        data        = <<-EOH
        {{- key (env "meta.ipc_node_index" | printf "jobs/ipc/keys/%s/fendermint.sk") -}}
        EOH
        destination = "local/fendermint.sk"
      }
    }

    task "cometbft" {
      driver = "docker"
      user   = "root"

      env {
        CMT_MONIKER = "cometbft-${meta.ipc_node_index}"
      }

      lifecycle {
        hook    = "poststart"
        sidecar = true
      }

      volume_mount {
        volume      = "cometbft"
        destination = "/data"
      }

      service {
        name = "cometbft-p2p-${meta.ipc_node_index}"
        port = "cometbft-p2p"
      }

      service {
        name = "cometbft-metrics"
        port = "cometbft-metrics"

        meta {
          instance = "cometbft-${meta.ipc_node_index}"
        }
      }

      config {
        image      = local.cometbft
        entrypoint = ["/local/entrypoint.sh"]
        command    = "run"

        ports = [
          "cometbft-p2p",
          "cometbft-metrics",
        ]
      }

      template {
        data        = <<-SCRIPT
        #!/usr/bin/env bash
        set -e

        if ! [[ -d ${CMT_DB_DIR} ]] && [[ -f ${CMT_PRIV_VALIDATOR_KEY_FILE} ]]; then
          # If private key is provided cometbft fails to start because state file is missing
          mkdir -p $(dirname ${CMT_PRIV_VALIDATOR_STATE_FILE})
          cat << KEY > ${CMT_PRIV_VALIDATOR_STATE_FILE}
          {
            "height": "0",
            "round": 0,
            "step": 0
          }
        KEY
          cometbft init
        fi

        exec cometbft "$@"
        SCRIPT
        destination = "local/entrypoint.sh"
        perms       = "777"
      }

      template {
        data        = <<-EOH
        CMT_HOME="/local"
        CMTHOME="/local"

        CMT_PROXY_APP='tcp://127.0.0.1:{{ env "NOMAD_PORT_fendermint_abci" }}'

        CMT_RPC_LADDR='tcp://127.0.0.1:{{ env "NOMAD_PORT_cometbft_rpc" }}'
        CMT_RPC_MAX_SUBSCRIPTION_CLIENTS=10
        CMT_RPC_MAX_SUBSCRIPTIONS_PER_CLIENT=1000
        CMT_RPC_TIMEOUT_BROADCAST_TX_COMMIT="120s"

        CMT_MEMPOOL_WAL_DIR="/data/mempool"
        CMT_DB_DIR="/cometbft/db"

        CMT_INSTRUMENTATION_PROMETHEUS=true
        CMT_INSTRUMENTATION_PROMETHEUS_LISTEN_ADDR='0.0.0.0:{{ env "NOMAD_PORT_cometbft_metrics" }}'

        CMT_LOG_LEVEL="debug"
        CMT_LOG_FORMAT="plain"

        CMT_GENESIS_FILE="/local/genesis.json"
        CMT_NODE_KEY_FILE="/secrets/node_key.json"
        CMT_PRIV_VALIDATOR_KEY_FILE="/secrets/priv_validator_key.json"
        CMT_PRIV_VALIDATOR_STATE_FILE="/data/priv_validator_key_state.json"

        CMT_P2P_PEX=true
        CMT_P2P_LADDR='tcp://0.0.0.0:{{ env "NOMAD_PORT_cometbft_p2p" }}'
        CMT_P2P_EXTERNAL_ADDRESS='{{ env "NOMAD_ADDR_cometbft_p2p" }}'
        CMT_P2P_SEED_MODE=false
        CMT_P2P_ADDR_BOOK_FILE="/data/addrbook.json"
        CMT_P2P_ADDR_BOOK_STRICT=false

        CMT_CONSENSUS_WAL_FILE="/data/cs/cs.wal"
        CMT_CONSENSUS_CREATE_EMPTY_BLOCKS=true
        CMT_CONSENSUS_CREATE_EMPTY_BLOCKS_INTERVAL="10s"
        CMT_CONSENSUS_TIMEOUT_COMMIT="10s"

        {{ $port := env "NOMAD_PORT_cometbft_p2p" -}}
        {{- $id := key "jobs/ipc/keys/0/cometbft.id" -}}
        CMT_P2P_SEEDS={{ printf "%s@cometbft-p2p-0.service.consul:%s" $id $port }}
        EOH
        destination = "local/config.env"
        env         = true
      }

      template {
        data        = <<-EOH
        {{- key "jobs/ipc/cometbft/genesis.json" -}}
        EOH
        destination = "local/genesis.json"
        change_mode = "noop"
      }

      template {
        data        = <<-EOH
        {{- key (env "meta.ipc_node_index" | printf "jobs/ipc/keys/%s/node_key.json") -}}
        EOH
        destination = "secrets/node_key.json"
      }

      template {
        data        = <<-EOH
        {{- key (env "meta.ipc_node_index" | printf "jobs/ipc/keys/%s/priv_validator_key.json") -}}
        EOH
        destination = "secrets/priv_validator_key.json"
      }

      resources {
        cpu        = 500
        memory     = 512
        memory_max = 1024
      }
    }

    task "eth-api" {
      driver = "docker"

      lifecycle {
        hook    = "poststart"
        sidecar = true
      }

      env {
        LOG_LEVEL            = "debug"
        TENDERMINT_RPC_URL   = "http://127.0.0.1:26657"
        TENDERMINT_WS_URL    = "ws://127.0.0.1:26657/websocket"
        FM_ETH__LISTEN__PORT = NOMAD_PORT_eth_api
        FM_ETH__LISTEN__HOST = "0.0.0.0"
        FM_NETWORK           = local.network
      }

      resources {
        cpu        = 100
        memory     = 64
        memory_max = 128
      }

      config {
        image      = local.fendermint
        force_pull = true
        command    = "eth"
        args = [
          "run",
        ]

        ports = [
          "eth",
        ]
      }
    }

    task "promtail" {
      driver = "docker"
      user   = "nobody"

      lifecycle {
        hook    = "poststart"
        sidecar = true
      }

      resources {
        cpu        = 50
        memory     = 64
        memory_max = 128
      }

      env {
        INDEX = meta.ipc_node_index
      }

      config {
        image = "grafana/promtail:2.9.8"

        args = [
          "-config.file=local/config.yml",
          "-config.expand-env=true",
        ]

        ports = [
          "promtail",
        ]
      }

      template {
        data        = <<-EOH
        {{ key "jobs/ipc/promtail/config.yml" }}
        EOH
        destination = "local/config.yml"
      }
    }
  }
}
