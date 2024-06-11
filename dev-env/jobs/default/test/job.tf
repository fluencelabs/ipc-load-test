resource "consul_keys" "configs" {
  key {
    path   = "jobs/test/promtail.yml"
    value  = file("promtail.yml")
    delete = true
  }
  key {
    path   = "jobs/test/script.sh"
    value  = file("script.sh")
    delete = true
  }
}

resource "nomad_job" "ipc" {
  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  detach           = true
  rerun_if_dead    = true
}
