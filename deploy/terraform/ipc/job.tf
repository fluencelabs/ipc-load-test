resource "consul_keys" "genesis" {
  key {
    path   = "jobs/ipc/cometbft/genesis.json"
    value  = file("files/cometbft/genesis.json")
    delete = true
  }
  key {
    path   = "jobs/ipc/fendermint/genesis.json"
    value  = file("files/fendermint/genesis.json")
    delete = true
  }
}

resource "consul_keys" "keys" {
  dynamic "key" {
    for_each = fileset(path.module, "keys/*/*")
    content {
      path   = "jobs/ipc/${key.value}"
      value  = trimspace(file("${key.value}"))
      delete = true
    }
  }
}

resource "nomad_job" "ipc" {
  depends_on = [
    consul_keys.genesis,
    consul_keys.keys,
  ]

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

resource "cloudflare_record" "fendermint" {
  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "fendermint.${terraform.workspace}"
  value           = "hashi.${terraform.workspace}.fluence.dev"
  type            = "CNAME"
  allow_overwrite = true
}

resource "cloudflare_record" "cometbft" {
  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "cometbft.${terraform.workspace}"
  value           = "hashi.${terraform.workspace}.fluence.dev"
  type            = "CNAME"
  allow_overwrite = true
}
