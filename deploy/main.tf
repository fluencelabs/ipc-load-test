resource "digitalocean_ssh_key" "key" {
  name       = "${terraform.workspace}-ssh-key"
  public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHu3yIMx4GYN2AeC+5keJgPsyOpnjYnQZTCcfsJQ/gRG"
}

data "digitalocean_droplet_snapshot" "snapshot" {
  name_regex  = "ephemeral-ubuntu-22-04-.*"
  region      = "fra1"
  most_recent = true
}
