locals {
  server = [
    for i in range(3) : format("%s-%d", "server", i)
  ]
}

resource "digitalocean_droplet" "server" {
  for_each = { for index, name in local.server : name => index }

  name      = "${terraform.workspace}-${each.key}"
  size      = "s-2vcpu-4gb"
  image     = data.digitalocean_droplet_snapshot.snapshot.id
  region    = var.region
  user_data = templatefile("${path.module}/files/server.sh", { workspace = terraform.workspace })

  tags = [
    terraform.workspace,
  ]

  ssh_keys = [
    digitalocean_ssh_key.key.id
  ]
}

resource "cloudflare_record" "server" {
  for_each = { for index, name in local.server : name => index }

  zone_id = data.cloudflare_zone.fluence_dev.zone_id
  name    = "${each.key}.${terraform.workspace}.fluence.dev"
  value   = digitalocean_droplet.server[each.key].ipv4_address
  type    = "A"
}

resource "cloudflare_record" "internal" {
  for_each = { for index, name in local.server : name => index }

  zone_id = data.cloudflare_zone.fluence_dev.zone_id
  name    = "servers.${terraform.workspace}.fluence.dev"
  value   = digitalocean_droplet.server[each.key].ipv4_address_private
  type    = "A"
}
