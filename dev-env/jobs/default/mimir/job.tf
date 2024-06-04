resource "consul_keys" "configs" {
  key {
    path   = "jobs/mimir/config.yml"
    value  = file("config.yml")
    delete = true
  }
}

resource "nomad_job" "mimir" {
  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  rerun_if_dead    = true
  detach           = false
}
