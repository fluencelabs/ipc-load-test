job "seaweedfs-csi" {
  datacenters = [
    "*",
  ]
  node_pool = "all"
  type      = "system"

  group "monolith" {
    ephemeral_disk {
      size = 1100
    }

    task "plugin" {
      driver = "docker"

      config {
        image = "chrislusf/seaweedfs-csi-driver:v1.1.8"

        args = [
          "--endpoint=unix://csi/csi.sock",
          "--filer=seaweedfs-filer.service.consul:9533",
          "--nodeid=${node.unique.name}",
          "--cacheCapacityMB=0",
          "--cacheDir=${NOMAD_ALLOC_DIR}/data/cache",
        ]

        privileged = true
        cap_add = [
          "SYS_ADMIN",
        ]
      }

      csi_plugin {
        id        = "seaweedfs"
        type      = "monolith"
        mount_dir = "/csi"
      }

      resources {
        cpu        = 100
        memory     = 256
        memory_max = 512
      }
    }
  }
}
