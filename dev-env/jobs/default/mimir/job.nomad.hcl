job "mimir" {
  datacenters = [
    "*",
  ]
  node_pool = "servers"

  group "mimir" {
    ephemeral_disk {
      size   = 1000
      sticky = true
    }

    network {
      port "http" {
        to     = 9898
        static = 9898
      }
      port "grpc" {}
    }

    service {
      name = "mimir"
      port = "http"

      meta {
        alloc_id = NOMAD_ALLOC_ID
      }

      check {
        name     = "Mimir"
        port     = "http"
        type     = "http"
        path     = "/ready"
        interval = "10s"
        timeout  = "1s"
      }
    }

    task "mimir" {
      driver = "docker"

      kill_signal  = "SIGINT"
      kill_timeout = "35s"

      config {
        image = "grafana/mimir:2.12.0"
        ports = [
          "http",
          "grpc",
        ]

        args = [
          "-target=all",
          "-config.file=/local/config.yml",
          "-config.expand-env=true",
          "-server.http-listen-port=${NOMAD_PORT_http}",
          "-server.grpc-listen-port=${NOMAD_PORT_grpc}",
        ]
      }

      template {
        data          = <<-EOH
        {{- key "jobs/mimir/config.yml" -}}
        EOH
        destination   = "local/config.yml"
        change_mode   = "signal"
        change_signal = "SIGHUP"
      }

      resources {
        cpu        = 500
        memory     = 512
        memory_max = 1024
      }
    }
  }
}
