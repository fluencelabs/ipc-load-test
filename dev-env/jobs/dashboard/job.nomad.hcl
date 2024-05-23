variable "workspace" {
  type = string
}

job "dashboard" {
  datacenters = [
    "*",
  ]
  node_pool = "servers"

  group "homer" {
    network {
      port "http" {
        to = 8080
      }
    }

    task "homer" {
      driver = "docker"

      env {
        WORKSPACE = var.workspace
      }

      resources {
        cpu    = 50
        memory = 64
      }

      config {
        image = "b4bz/homer:v23.10.1"

        ports = [
          "http",
        ]

        volumes = [
          "local/assets/:/www/assets/",
        ]
      }

      template {
        data        = file("./config.yml")
        destination = "local/assets/config.yml"
      }

      service {
        name = "dashboard"
        port = "http"

        tags = [
          "traefik.enable=true",
          "traefik.http.routers.dashboard.entrypoints=https",
          "traefik.http.routers.dashboard.rule=Host(`dash.${var.workspace}.fluence.dev`)"
        ]

        check {
          name     = "Homer HTTP"
          type     = "http"
          path     = "/"
          interval = "10s"
          timeout  = "1s"
        }
      }
    }
  }
}
