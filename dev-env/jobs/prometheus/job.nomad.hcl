variable "workspace" {
  type = string
}

job "prometheus" {
  datacenters = [
    "*",
  ]
  node_pool = "servers"

  group "prometheus" {
    ephemeral_disk {
      size    = 2100
      sticky  = true
      migrate = true
    }

    network {
      port "http" {
        to     = 9090
        static = 9090
      }
    }

    service {
      name = "prometheus"
      port = "http"

      tags = [
        "traefik.enable=true",
        "traefik.http.routers.prometheus.entrypoints=https",
        "traefik.http.routers.prometheus.rule=Host(`prometheus.${var.workspace}.fluence.dev`)",
      ]

      check {
        name     = "Prometheus HTTP"
        type     = "http"
        path     = "/-/healthy"
        interval = "10s"
        timeout  = "1s"
      }
    }

    env {
      WORKSPACE = var.workspace
    }

    task "prometheus" {
      driver = "docker"

      config {
        image        = "prom/prometheus:v2.52.0"
        network_mode = "host"

        ports = [
          "http",
        ]

        args = [
          "--web.listen-address=0.0.0.0:${NOMAD_PORT_http}",
          "--web.external-url=https://prometheus.${var.workspace}.fluence.dev",
          "--web.page-title=Fluence prometheus instance - dev environment",
          "--config.file=/local/config.yml",
          "--enable-feature=expand-external-labels",
          "--storage.tsdb.path=/alloc/data/",
          "--storage.tsdb.retention.size=2GB",
        ]
      }

      template {
        data          = <<-EOH
        {{ key "jobs/prometheus/config.yml" }}
        EOH
        destination   = "local/config.yml"
        change_mode   = "signal"
        change_signal = "SIGHUP"
      }

      resources {
        cpu        = 100
        memory     = 128
        memory_max = 512
      }
    }
  }
}
