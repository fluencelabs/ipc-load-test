resource "nomad_job" "grafana" {
  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}

resource "cloudflare_record" "grafana" {
  zone_id = data.cloudflare_zone.fluence_dev.zone_id
  name    = "grafana.${terraform.workspace}"
  value   = "hashi.${terraform.workspace}.fluence.dev"
  type    = "CNAME"
}
