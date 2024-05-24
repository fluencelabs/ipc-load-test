variable "workspace" {
  type = string
}

variable "dashboards" {
  type = string
}

job "grafana" {
  datacenters = [
    "*",
  ]
  node_pool = "servers"


  group "grafana" {
    ephemeral_disk {
      size    = 500
      migrate = true
      sticky  = true
    }

    network {
      port "http" {
        to = 3000
      }
    }

    service {
      name = "grafana"
      port = "http"

      tags = [
        "traefik.enable=true",
        "traefik.http.routers.grafana.entrypoints=https",
        "traefik.http.routers.grafana.rule=Host(`grafana.${var.workspace}.fluence.dev`)",
      ]

      check {
        name     = "Grafana HTTP"
        type     = "http"
        path     = "/api/health"
        interval = "10s"
        timeout  = "1s"
      }
    }

    task "grafana" {
      driver = "docker"
      user   = "nobody"

      resources {
        cpu        = 100
        memory     = 256
        memory_max = 512
      }

      env {
        GF_PATHS_PROVISIONING      = "/local/provisioning"
        GF_SERVER_DOMAIN           = "grafana.${var.workspace}.fluence.dev"
        GF_SERVER_ENABLE_GZIP      = true
        GF_SERVER_ROOT_URL         = "https://grafana.${var.workspace}.fluence.dev"
        GF_USERS_ALLOW_SIGN_UP     = false
        GF_USERS_ALLOW_ORG_CREATE  = false
        GF_AUTH_DISABLE_LOGIN_FORM = false
        GF_AUTH_ANONYMOUS_ENABLED  = "true"
        GF_AUTH_ANONYMOUS_ORG_ROLE = "Admin"
        GF_INSTANCE_NAME           = "Grafana - dev environment"
        GF_PATHS_DATA              = "/alloc/data"
      }

      config {
        image = "grafana/grafana:11.0.0"

        ports = [
          "http",
        ]
      }

      template {
        data        = <<-EOH
        apiVersion: 1
        datasources:
          - name: "Loki"
            type: "loki"
            url: "http://loki.service.consul:3100"
            basicAuth: false
            jsonData:
              maxLines: 1000

          - name: "Prometheus"
            type: "prometheus"
            url: "http://prometheus.service.consul:9090"
            isDefault: true
            basicAuth: false
            jsonData:
              timeInterval: "15s"
              manageAlerts: false
        EOH
        destination = "local/provisioning/datasources/datasources.yml"
      }

      template {
        data        = <<-EOH
        apiVersion: 1
        providers:
          - name: 'fluencelabs'
            disableDeletion: true
            updateIntervalSeconds: 10
            allowUiUpdates: true
            options:
              path: /local/dashboards
              foldersFromFilesStructure: true

        EOH
        destination = "local/provisioning/dashboards/dashboards.yml"
      }

      dynamic "template" {
        for_each = split(",", var.dashboards)

        content {
          data        = <<-EOH
          {{ key "jobs/grafana/${template.value}" }}
          EOH
          destination = "local/${template.value}"
          change_mode = "noop"
        }
      }
    }
  }
}
