variable "workspace" {
  type = string
}

job "loki" {
  datacenters = [
    "*",
  ]
  node_pool = "servers"

  group "loki" {
    ephemeral_disk {
      size    = 2100
      sticky  = true
      migrate = true
    }

    network {
      port "http" {
        to     = 3100
        static = 3100
      }
    }

    task "loki" {
      driver = "docker"

      kill_signal  = "SIGINT"
      kill_timeout = "35s"

      service {
        name = "loki"
        port = "http"

        tags = [
          "traefik.enable=true",
          "traefik.http.routers.loki.entrypoints=https",
          "traefik.http.routers.loki.rule=Host(`loki.${var.workspace}.fluence.dev`)",
        ]

        check {
          name     = "Loki HTTP"
          port     = "http"
          type     = "http"
          path     = "/ready"
          interval = "10s"
          timeout  = "1s"
        }
      }

      config {
        image = "grafana/loki:2.9.8"

        ports = [
          "http",
        ]

        args = [
          "-target=all",
          "-config.file=/local/config.yml",
          "-config.expand-env=true",
          "-server.http-listen-port=${NOMAD_PORT_http}",
        ]
      }

      template {
        data        = <<-EOH
        {{ key "jobs/loki/config.yml" }}
        EOH
        destination = "local/config.yml"
        change_mode = "restart"
      }

      resources {
        cpu        = 500
        memory     = 2048
        memory_max = 3000
      }
    }
  }
}
