variable "workspace" {
  type = string
}

variable "buckets" {
  type    = string
}

job "seaweedfs" {
  datacenters = [
    "*",
  ]
  node_pool = "servers"

  group "master" {
    count = 3

    network {
      port "http" {
        to     = 9333
        static = 9333
      }
      port "grpc" {
        to     = 19333
        static = 19333
      }
      port "metrics" {}
    }

    volume "master" {
      type   = "host"
      source = "seaweedfs-master"
    }

    task "master" {
      driver = "docker"

      kill_signal  = "SIGINT"
      kill_timeout = "90s"

      volume_mount {
        volume      = "master"
        destination = "/data"
      }

      env {
        WEED_MASTER_VOLUME_GROWTH_COPY_1 = "2"
      }

      config {
        image = "chrislusf/seaweedfs:3.67"

        ports = [
          "http",
          "grpc",
          "metrics",
        ]

        args = [
          "-v=1",
          "master",
          "-mdir=/data",
          "-defaultReplication=010",
          "-peers=${PEERS}",

          "-ip=${NOMAD_IP_http}",
          "-ip.bind=0.0.0.0",
          "-port=${NOMAD_PORT_http}",
          "-port.grpc=${NOMAD_PORT_grpc}",
          "-metricsPort=${NOMAD_PORT_metrics}",

          "-raftHashicorp",
          "-raftBootstrap",
          "-resumeState",
        ]
      }

      template {
        data        = <<-EOH
        {{- $peers := service "consul" -}}
        {{- if $peers -}}
          {{ $last := len $peers | subtract 1 -}}
        PEERS=
          {{- range $i := loop $last -}}
            {{- with index $peers $i }}{{ .Address }}:9333,{{- end -}}
          {{- end -}}
          {{- with index $peers $last }}{{ .Address }}:9333{{- end -}}
        {{- end -}}
        EOH
        destination = "local/peers.env"
        env         = true
        change_mode = "noop"
      }

      resources {
        cpu        = 300
        memory     = 128
        memory_max = 256
      }

      service {
        name = "seaweedfs-master"
        port = "http"

        meta {
          alloc_id  = NOMAD_ALLOC_ID
          component = "master"
          metrics   = NOMAD_ADDR_metrics
        }

        tags = [
          "traefik.enable=true",
          "traefik.http.routers.seaweedfs-master.entrypoints=https",
          "traefik.http.routers.seaweedfs-master.rule=Host(`seaweedfs.${var.workspace}.fluence.dev`)",
        ]
      }
    }
  }

  group "volume" {
    count = 3

    network {
      port "http" {
        to     = 9433
        static = 9433
      }
      port "grpc" {
        to     = 19433
        static = 19433
      }
      port "metrics" {}
    }

    task "volume" {
      driver = "docker"

      kill_signal  = "SIGINT"
      kill_timeout = "90s"

      config {
        image = "chrislusf/seaweedfs:3.67"

        ports = [
          "http",
          "grpc",
          "metrics",
        ]

        args = [
          "-v=1",
          "volume",
          "-dir=/data",
          "-max=0",

          "-dataCenter=${node.datacenter}",
          "-rack=${node.unique.name}",
          "-publicUrl=${NOMAD_ADDR_http}",

          "-mserver=${MASTERS}",

          "-ip=${NOMAD_IP_http}",
          "-ip.bind=0.0.0.0",
          "-port=${NOMAD_PORT_http}",
          "-port.grpc=${NOMAD_PORT_grpc}",
          "-metricsPort=${NOMAD_PORT_metrics}",
        ]
      }

      template {
        data        = <<-EOH
        {{- $peers := service "consul" -}}
        {{- if $peers -}}
          {{ $last := len $peers | subtract 1 -}}
        MASTERS=
          {{- range $i := loop $last -}}
            {{- with index $peers $i }}{{ .Address }}:9333,{{- end -}}
          {{- end -}}
          {{- with index $peers $last }}{{ .Address }}:9333{{- end -}}
        {{- end -}}
        EOH
        destination = "local/masters.env"
        env         = true
        change_mode = "noop"
      }

      resources {
        cpu        = 500
        memory     = 512
        memory_max = 1024
      }

      service {
        name = "seaweedfs-volume"
        port = "http"

        meta {
          alloc_id  = NOMAD_ALLOC_ID
          component = "volume"
          metrics   = NOMAD_ADDR_metrics
        }

        check {
          name     = "SeaweedFS volume"
          type     = "http"
          protocol = "http"
          port     = "http"
          path     = "/healthz"
          interval = "20s"
          timeout  = "1s"
        }
      }
    }
  }

  group "filer" {
    network {
      port "http" {
        to     = 9533
        static = 9533
      }
      port "grpc" {
        to     = 19533
        static = 19533
      }
      port "s3" {
        to     = 9534
        static = 9534
      }
      port "metrics" {}
    }

    task "filer" {
      driver = "docker"

      kill_signal  = "SIGINT"
      kill_timeout = "90s"

      config {
        image = "chrislusf/seaweedfs:3.67"

        ports = [
          "http",
          "grpc",
          "s3",
          "metrics",
        ]

        args = [
          "-v=1",
          "filer",
          "-master=dnssrv+seaweedfs-master.service.consul",

          "-s3=true",
          "-s3.config=/local/s3.json",
          "-s3.port=${NOMAD_PORT_s3}",
          "-s3.domainName=seaweedfs-filer.service.consul",

          "-webdav=false",

          "-dataCenter=${node.datacenter}",
          "-rack=${node.unique.name}",

          "-ip=${NOMAD_IP_http}",
          "-ip.bind=0.0.0.0",
          "-port=${NOMAD_PORT_http}",
          "-port.grpc=${NOMAD_PORT_grpc}",
          "-metricsPort=${NOMAD_PORT_metrics}",
        ]

        volumes = [
          "local/filer.toml:/etc/seaweedfs/filer.toml:ro"
        ]
      }

      template {
        data        = <<-EOF
        {{- key "jobs/seaweedfs/filer/filer.toml" -}}
        EOF
        destination = "local/filer.toml"
        change_mode = "noop"
      }

      template {
        data        = <<-EOF
        {{- key "jobs/seaweedfs/filer/s3.json" -}}
        EOF
        destination = "local/s3.json"
        change_mode = "signal"
        change_signal = "SIGHUP"
      }


      template {
        data = <<-EOH
        WEED_POSTGRES2_USERNAME='seaweedfs'
        WEED_POSTGRES2_PASSWORD='seaweedfs'
        EOH

        destination = "secrets/db.env"
        env         = true
      }

      resources {
        cpu        = 500
        memory     = 256
        memory_max = 512
      }

      service {
        name = "seaweedfs-filer"
        port = "http"

        tags = [
          "traefik.enable=true",
          "traefik.http.routers.seaweedfs-filer.entrypoints=https",
          "traefik.http.routers.seaweedfs-filer.rule=Host(`files.${var.workspace}.fluence.dev`)",
        ]

        meta {
          alloc_id  = NOMAD_ALLOC_ID
          component = "filer"
          metrics   = NOMAD_ADDR_metrics
        }
      }
    }

    task "shell" {
      lifecycle {
        hook = "poststart"
      }

      driver = "docker"

      env {
        WEED_CLUSTER_DEFAULT   = "sw"
        WEED_CLUSTER_SW_MASTER = "seaweedfs-master.service.consul:9333"
        WEED_CLUSTER_SW_FILER  = "seaweedfs-filer.service.consul:9533"
      }

      config {
        image      = "chrislusf/seaweedfs:3.67"
        entrypoint = ["/local/buckets.sh"]
      }

      template {
        data        = <<-EOH
        #! /usr/bin/env sh
        IFS=','
        for bucket in $(echo ${var.buckets}); do
          echo $bucket
          echo "s3.bucket.create -name $bucket" | weed shell
        done
        EOH
        destination = "/local/buckets.sh"
        perms       = 777
      }
    }
  }
}
