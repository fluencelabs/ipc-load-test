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

  # promtail config
  key {
    path   = "jobs/traefik/promtail.yml"
    value  = file("promtail.yml")
    delete = true
  }
}

resource "nomad_job" "traefik" {
  depends_on = [
    consul_keys.configs,
    consul_keys.cert,
  ]

  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true

  hcl2 {
    vars = {
      configs   = join(",", fileset(path.module, "configs/*.yml"))
      workspace = terraform.workspace
    }
  }
}

data "cloudflare_zone" "fluence_dev" {
  name = "fluence.dev"
}

resource "cloudflare_record" "traefik" {
  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "traefik.${terraform.workspace}"
  value           = "hashi.${terraform.workspace}.fluence.dev"
  type            = "CNAME"
  allow_overwrite = true
}
