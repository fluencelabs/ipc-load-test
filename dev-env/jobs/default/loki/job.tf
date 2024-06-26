resource "consul_keys" "configs" {
  key {
    path   = "jobs/loki/config.yml"
    value  = file("config.yml")
    delete = true
  }
}

resource "nomad_job" "loki" {
  depends_on = [
    consul_keys.configs,
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
