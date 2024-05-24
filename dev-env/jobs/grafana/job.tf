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

  hcl2 {
    vars = {
      dashboards = join(",", fileset(path.module, "dashboards/**"))
      workspace  = terraform.workspace
    }
  }
}
