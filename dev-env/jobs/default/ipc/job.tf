resource "consul_keys" "configs" {
  key {
    path   = "jobs/ipc/promtail/config.yml"
    value  = file("files/promtail/config.yml")
    delete = true
  }
  key {
    path   = "jobs/ipc/vector/config.yml"
    value  = file("files/vector/config.yml")
    delete = true
  }
}

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
  detach           = false
  rerun_if_dead    = true

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}
