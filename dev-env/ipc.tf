locals {
  flattened_instances = flatten([
    for instance in var.instances : [
      for i in range(instance.count) : {
        type = instance.type
      }
    ]
  ])
}

resource "digitalocean_droplet" "ipc" {
  depends_on = [cloudflare_record.internal]

  for_each = {
    for idx, instance in local.flattened_instances : idx => instance
  }

  name      = "${terraform.workspace}-ipc-${each.key}"
  size      = each.value.type
  image     = var.snapshot
  region    = var.region
  user_data = templatefile("${path.module}/files/ipc.sh", { workspace = terraform.workspace, index = each.key })
  vpc_uuid  = digitalocean_vpc.dev.id

  tags = [
    terraform.workspace,
    "dev",
  ]

  ssh_keys = [
    data.digitalocean_ssh_key.key.id
  ]

}

resource "cloudflare_record" "ipc" {
  for_each = {
    for idx, instance in local.flattened_instances : idx => instance
  }

  zone_id = data.cloudflare_zone.fluence_dev.zone_id
  name    = "ipc-${each.key}.${terraform.workspace}.fluence.dev"
  value   = digitalocean_droplet.ipc[each.key].ipv4_address
  type    = "A"
}
