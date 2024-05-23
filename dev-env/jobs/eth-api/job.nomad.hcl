locals {
  fendermint = "fluencelabs/fendermint:fluence-batching-actor"
  network    = "testnet"
}

variable "workspace" {
  type = string
}

job "eth-api" {
  datacenters = [
    "*",
  ]
  node_pool = "ipc"

  group "eth-api" {
    network {
      mode = "bridge"

      dns {
        servers = ["172.17.0.1"]
      }

      port "eth" {}

      port "envoy" {
        to = 9102
      }
    }

    service {
      name = "eth-api"
      port = "eth"

      tags = [
        "traefik.enable=true",
        "traefik.consulcatalog.connect=true",
        "traefik.http.routers.eth-api.entrypoints=https",
        "traefik.http.routers.eth-api.rule=Host(`ipc.${var.workspace}.fluence.dev`)"
      ]

      meta {
        envoy = NOMAD_HOST_PORT_envoy
      }

      connect {
        sidecar_service {
          proxy {
            upstreams {
              destination_name = "cometbft"
              local_bind_port  = 80
            }
          }
        }
      }
    }

    task "fendermint" {
      driver = "docker"

      env {
        LOG_LEVEL            = "info"
        TENDERMINT_RPC_URL   = "http://127.0.0.1:80"
        TENDERMINT_WS_URL    = "ws://127.0.0.1:80/websocket"
        FM_ETH__LISTEN__PORT = NOMAD_PORT_eth
        FM_ETH__LISTEN__HOST = "127.0.0.1"
        FM_NETWORK           = local.network
      }

      resources {
        cpu        = 100
        memory     = 128
        memory_max = 512
      }

      config {
        image      = local.fendermint
        force_pull = true
        command    = "eth"
        args = [
          "run",
        ]
      }
    }
  }
}
