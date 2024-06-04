resource "consul_keys" "configs" {
  key {
    path   = "jobs/seaweedfs/filer/filer.toml"
    value  = file("configs/filer.toml")
    delete = true
  }
}

resource "nomad_job" "seaweedfs" {
  depends_on = [
    consul_keys.configs,
    postgresql_database.seaweedfs,
  ]

  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  detach           = false
  rerun_if_dead    = true

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}

resource "postgresql_role" "seaweedfs" {
  name     = "seaweedfs"
  password = "seaweedfs"
  login    = true
}

resource "postgresql_database" "seaweedfs" {
  name  = "seaweedfs"
  owner = postgresql_role.seaweedfs.name
}

resource "postgresql_default_privileges" "seaweedfs" {
  role     = postgresql_role.seaweedfs.name
  database = postgresql_database.seaweedfs.name
  schema   = "public"

  owner       = postgresql_role.seaweedfs.name
  object_type = "table"
  privileges = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
  ]
}
