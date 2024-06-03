resource "consul_keys" "configs" {
  # traefik dynamic configs
  dynamic "key" {
    for_each = fileset(path.module, "configs/*.yml")
    content {
      path   = "jobs/traefik/configs/${key.value}"
      value  = file("${key.value}")
      delete = true
    }
  }
}

resource "nomad_job" "traefik" {
  depends_on = [
    consul_keys.configs,
    consul_keys.cert,
  ]

  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  rerun_if_dead    = true
  detach           = false

  hcl2 {
    vars = {
      configs   = join(",", fileset(path.module, "configs/*.yml"))
      workspace = terraform.workspace
    }
  }
}
