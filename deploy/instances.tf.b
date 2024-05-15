resource "digitalocean_droplet" "ipc" {
  for_each = {
    for idx, instance in local.instances : "${instance.type}-${idx}" => instance
  }

  name       = "${terraform.workspace}-${each.key}"
  size       = each.value.type
  image      = "ubuntu-22-04-x64"
  region     = local.region
  vpc_uuid   = digitalocean_vpc.stage.id
  monitoring = true

  tags = [
    terraform.workspace,
  ]

  ssh_keys = [
    data.terraform_remote_state.hashistack.outputs.ssh-key-id
  ]
}

resource "cloudflare_record" "ipc" {
  for_each = {
    for idx, instance in local.flattened_instances : "${instance.type}-${idx}" => instance
  }

  zone_id = data.cloudflare_zone.fluence_dev.zone_id
  name    = "${each.key}.${terraform.workspace}.fluence.dev"
  value   = digitalocean_droplet.ipc[each.key].ipv4_address
  type    = "A"
}
