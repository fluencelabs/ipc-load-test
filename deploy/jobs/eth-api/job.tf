resource "nomad_job" "ipc" {
  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}

data "cloudflare_zone" "fluence_dev" {
  name = "fluence.dev"
}

resource "cloudflare_record" "ipc" {
  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "ipc.${terraform.workspace}"
  value           = "hashi.${terraform.workspace}.fluence.dev"
  type            = "CNAME"
  allow_overwrite = true
}
