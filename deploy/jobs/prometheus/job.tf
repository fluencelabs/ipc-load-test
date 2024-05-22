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

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}

resource "cloudflare_record" "prometheus" {
  zone_id = data.cloudflare_zone.fluence_dev.zone_id
  name    = "prometheus.${terraform.workspace}"
  value   = "hashi.${terraform.workspace}.fluence.dev"
  type    = "CNAME"
}
