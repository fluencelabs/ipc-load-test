resource "consul_keys" "configs" {
  key {
    path   = "jobs/postgres/patroni.yml"
    value  = file("patroni.yml")
    delete = true
  }
}

resource "nomad_job" "postgres" {
  depends_on = [
    consul_keys.configs,
  ]

  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  detach           = false
  rerun_if_dead    = true
}
