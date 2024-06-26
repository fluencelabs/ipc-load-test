resource "consul_keys" "configs" {
  key {
    path   = "jobs/prometheus/config.yml"
    value  = file("config.yml")
    delete = true
  }
}

resource "nomad_job" "prometheus" {
  depends_on = [
    consul_keys.configs,
  ]

  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  rerun_if_dead    = true
  detach           = false

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}
