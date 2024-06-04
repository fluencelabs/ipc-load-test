locals {
  server = [
    for i in range(3) : format("%s-%d", "server", i)
  ]
}

resource "digitalocean_droplet" "server" {
  for_each = { for index, name in local.server : name => index }

  name      = "${terraform.workspace}-${each.key}"
  size      = "s-4vcpu-8gb"
  image     = var.snapshot
  region    = var.region
  user_data = templatefile("${path.module}/files/server.sh", { workspace = terraform.workspace })
  vpc_uuid  = digitalocean_vpc.dev.id

  tags = [
    terraform.workspace,
    "dev",
  ]

  ssh_keys = [
    data.digitalocean_ssh_key.key.id
  ]
}

resource "cloudflare_record" "server" {
  for_each = { for index, name in local.server : name => index }

  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "${each.key}.${terraform.workspace}.fluence.dev"
  value           = digitalocean_droplet.server[each.key].ipv4_address
  type            = "A"
  allow_overwrite = true
}

resource "cloudflare_record" "hashi" {
  for_each = { for index, name in local.server : name => index }

  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "hashi.${terraform.workspace}.fluence.dev"
  value           = digitalocean_droplet.server[each.key].ipv4_address
  type            = "A"
  allow_overwrite = true
}

resource "cloudflare_record" "internal" {
  for_each = { for index, name in local.server : name => index }

  lifecycle {
    create_before_destroy = true
  }

  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "servers.${terraform.workspace}.fluence.dev"
  value           = digitalocean_droplet.server[each.key].ipv4_address_private
  type            = "A"
  allow_overwrite = true
}

resource "cloudflare_record" "records" {
  for_each = toset([
    "dash",
    "nomad",
    "consul",
    "cometbft",
    "fendermint",
    "traefik",
    "prometheus",
    "grafana",
    "loki",
    "ipc",
    "files",
    "postgres",
  ])

  zone_id         = data.cloudflare_zone.fluence_dev.zone_id
  name            = "${each.value}.${terraform.workspace}"
  value           = "hashi.${terraform.workspace}.fluence.dev"
  type            = "CNAME"
  allow_overwrite = true
}
