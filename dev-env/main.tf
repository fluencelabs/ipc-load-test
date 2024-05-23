data "digitalocean_ssh_key" "key" {
  name       = "default-ssh-key"
}

# data "digitalocean_droplet_snapshot" "snapshot" {
#   name_regex  = "ephemeral-ubuntu-22-04-.*"
#   region      = "fra1"
#   most_recent = true
# }
