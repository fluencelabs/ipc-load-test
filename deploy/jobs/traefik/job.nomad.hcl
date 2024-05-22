variable "configs" {
  type = string
}

variable "workspace" {
  type = string
}

locals {
  cidr = "10.135.0.0/16" # default DO FRA1 VPC
}

job "traefik" {
  datacenters = [
    "*",
  ]
  type      = "system"
  node_pool = "servers"

  group "traefik" {
    network {
      mode = "host"

      port "traefik" {
        to     = 59427
        static = 59427
      }

      port "http" {
        to     = 80
        static = 80
      }

      port "https" {
        to     = 443
        static = 443
      }
    }

    service {
      name = "traefik"
      port = "traefik"
      task = "traefik"

      connect {
        native = true
      }

      meta {
        alloc_id = NOMAD_ALLOC_ID
      }

      tags = [
        "traefik.enable=true",
        "traefik.http.routers.api.entrypoints=https",
        "traefik.http.routers.api.rule=Host(`traefik.${var.workspace}.fluence.dev`)",
        "traefik.http.routers.api.service=api@internal",
      ]

      check {
        name     = "Traefik HTTP"
        type     = "http"
        path     = "/ping"
        port     = "traefik"
        interval = "10s"
        timeout  = "1s"
      }
    }

    task "traefik" {
      driver       = "docker"
      kill_timeout = "30s"

      resources {
        cpu        = 50
        memory     = 128
        memory_max = 512
      }

      config {
        image = "traefik:2.11"

        network_mode = "host"
        ports = [
          "traefik",
          "http",
          "https",
        ]
      }

      template {
        data        = <<-EOH
        TRAEFIK_ENTRYPOINTS_TRAEFIK_ADDRESS=":59427"
        TRAEFIK_ENTRYPOINTS_TRAEFIK_PROXYPROTOCOL_TRUSTEDIPS="${local.cidr}"
        TRAEFIK_PING_ENTRYPOINT="traefik"
        TRAEFIK_METRICS_PROMETHEUS_ENTRYPOINT="traefik"
        TRAEFIK_METRICS_PROMETHEUS_ADDENTRYPOINTSLABELS="true"
        TRAEFIK_METRICS_PROMETHEUS_ADDROUTERSLABELS="true"
        TRAEFIK_METRICS_PROMETHEUS_ADDSERVICESLABELS="true"
        TRAEFIK_PILOT_DASHBOARD="false"
        TRAEFIK_API_DASHBOARD="true"
        TRAEFIK_PROVIDERS_FILE_WATCH="true"
        TRAEFIK_PROVIDERS_FILE_DIRECTORY="/local/configs"
        # http
        TRAEFIK_ENTRYPOINTS_HTTP_ADDRESS=":80"
        TRAEFIK_ENTRYPOINTS_HTTP_PROXYPROTOCOL_TRUSTEDIPS="${local.cidr}"
        TRAEFIK_ENTRYPOINTS_HTTP_TRANSPORT_LIFECYCLE_REQUESTACCEPTGRACETIMEOUT="15"
        TRAEFIK_ENTRYPOINTS_HTTP_TRANSPORT_LIFECYCLE_GRACETIMEOUT="10"
        TRAEFIK_ENTRYPOINTS_HTTP_HTTP_REDIRECTIONS_ENTRYPOINT_TO=":443"
        TRAEFIK_ENTRYPOINTS_HTTP_HTTP_REDIRECTIONS_ENTRYPOINT_SCHEME="https"
        TRAEFIK_ENTRYPOINTS_HTTP_HTTP_REDIRECTIONS_ENTRYPOINT_PERMANENT="true"
        # https
        TRAEFIK_ENTRYPOINTS_HTTPS_ADDRESS=":443"
        TRAEFIK_ENTRYPOINTS_HTTPS_PROXYPROTOCOL_TRUSTEDIPS="${local.cidr}"
        TRAEFIK_ENTRYPOINTS_HTTPS_TRANSPORT_LIFECYCLE_REQUESTACCEPTGRACETIMEOUT="15"
        TRAEFIK_ENTRYPOINTS_HTTPS_TRANSPORT_LIFECYCLE_GRACETIMEOUT="10"
        TRAEFIK_ENTRYPOINTS_HTTPS_HTTP_TLS_DOMAINS_0_MAIN="${var.workspace}.fluence.dev"
        TRAEFIK_ENTRYPOINTS_HTTPS_HTTP_TLS_DOMAINS_0_SANS_0="*.${var.workspace}.fluence.dev"
        EOH
        destination = "local/config.env"
        env         = true
      }

      template {
        data        = <<-EOH
        TRAEFIK_PROVIDERS_CONSULCATALOG_PREFIX="traefik"
        TRAEFIK_PROVIDERS_CONSULCATALOG_EXPOSEDBYDEFAULT="false"
        TRAEFIK_PROVIDERS_CONSULCATALOG_SERVICENAME="traefik"
        TRAEFIK_PROVIDERS_CONSULCATALOG_CONNECTAWARE="true"
        TRAEFIK_PROVIDERS_CONSULCATALOG_ENDPOINT_ADDRESS='127.0.0.1:8500'
        EOH
        destination = "local/consul.env"
        env         = true
        splay       = "5m"
      }

      dynamic "template" {
        for_each = split(",", var.configs)

        content {
          data        = <<-EOH
          {{ key "jobs/traefik/configs/${template.value}" }}
          EOH
          destination = "local/${template.value}"
          change_mode = "noop"
        }
      }

      template {
        data = <<-EOH
        {{ key "certs/fluence.dev/ca_bundle" }}
        EOH

        destination = "secrets/certs/fluence.dev/bundle.pem"
        change_mode = "restart"
        splay       = "10m"
      }

      template {
        data = <<-EOH
        {{ key "certs/fluence.dev/private_key" }}
        EOH

        destination = "secrets/certs/fluence.dev/key.pem"
        change_mode = "restart"
        splay       = "10m"
      }
    }
  }
}
