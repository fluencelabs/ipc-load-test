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

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}

resource "cloudflare_record" "loki" {
  zone_id = data.cloudflare_zone.fluence_dev.zone_id
  name    = "loki.${terraform.workspace}"
  value   = "hashi.${terraform.workspace}.fluence.dev"
  type    = "CNAME"
}
