job "test" {
  datacenters = ["*"]
  node_pool   = "all"

  group "test" {
    network {
      port "promtail" {}
    }

    task "test" {
      driver = "exec"

      config {
        command = "/bin/bash"
        args    = ["/local/script.sh"]
      }

      template {
        data        = <<-EOH
        {{ key "jobs/test/script.sh" }}
        EOH
        destination = "local/script.sh"
        perms       = 777
      }

      resources {
        cpu    = 50
        memory = 32
      }
    }

    task "promtail" {
      driver = "docker"
      user   = "nobody"

      lifecycle {
        hook    = "poststart"
        sidecar = true
      }

      service {
        name = "ipc-promtail"
        port = "promtail"

        meta {
          instance = "fendermint-0"
        }
      }

      resources {
        cpu        = 50
        memory     = 64
        memory_max = 128
      }

      env {
        INDEX = "0"
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
        {{ key "jobs/test/promtail.yml" }}
        EOH
        destination = "local/config.yml"
      }
    }
  }
}
