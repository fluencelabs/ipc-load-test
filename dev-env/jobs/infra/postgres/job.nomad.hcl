job "patroni" {
  datacenters = ["*"]
  node_pool   = "servers"

  group "patroni" {
    count = 3

    network {
      port "postgres" {
        to     = 5432
        static = 5432
      }

      port "patroni" {
        to     = 8043
        static = 8043
      }
    }

    service {
      name = "patroni"
      port = "patroni"

      check {
        name     = "Patroni HTTP"
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "2s"
      }
    }

    volume "postgres" {
      type   = "host"
      source = "postgres"
    }

    task "patroni" {
      driver = "docker"

      kill_signal  = "SIGINT"
      kill_timeout = "60s"

      resources {
        cpu        = 100
        memory     = 256
        memory_max = 512
      }

      volume_mount {
        volume      = "postgres"
        destination = "/data"
      }

      env {
        PATRONI_NAME                       = node.unique.name
        PATRONI_LOG_LEVEL                  = "INFO"
        PATRONI_RESTAPI_CONNECT_ADDRESS    = NOMAD_ADDR_patroni
        PATRONI_POSTGRESQL_CONNECT_ADDRESS = NOMAD_ADDR_postgres

        DATA_DIR  = "/data"
        CERTS_DIR = "/secrets/certs"
      }

      config {
        image        = "nahsihub/patroni:14-2.1.7"
        command      = "/local/patroni.yml"
        network_mode = "host"
        init         = true

        ports = [
          "postgres",
          "patroni",
        ]
      }

      template {
        data          = <<-EOF
        {{- key "jobs/postgres/patroni.yml" -}}
        EOF
        destination   = "local/patroni.yml"
        change_mode   = "signal"
        change_signal = "SIGHUP"
      }

      template {
        data = <<-EOF
        PATRONI_SUPERUSER_USERNAME=postgres
        PATRONI_SUPERUSER_PASSWORD=postgres
        PATRONI_REPLICATION_USERNAME=repl
        PATRONI_REPLICATION_PASSWORD=repl
        EOF
        destination = "secrets/users.env"
        env         = true
      }
    }
  }
}
