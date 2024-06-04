resource "consul_keys" "dashboards" {
  dynamic "key" {
    for_each = fileset(path.module, "dashboards/**")
    content {
      path   = "jobs/grafana/${key.value}"
      value  = trimspace(file("${key.value}"))
      delete = true
    }
  }
}

resource "nomad_job" "grafana" {
  depends_on = [consul_keys.dashboards]

  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  detach           = false
  rerun_if_dead    = true

  hcl2 {
    vars = {
      dashboards = join(",", fileset(path.module, "dashboards/**"))
      workspace  = terraform.workspace
    }
  }
}

resource "postgresql_role" "grafana" {
  name     = "grafana"
  password = "grafana"
  login    = true
}

resource "postgresql_database" "grafana" {
  name  = "grafana"
  owner = postgresql_role.grafana.name
}

resource "postgresql_default_privileges" "grafana" {
  role     = postgresql_role.grafana.name
  database = postgresql_database.grafana.name
  schema   = "public"

  owner       = postgresql_role.grafana.name
  object_type = "table"
  privileges = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
  ]
}
