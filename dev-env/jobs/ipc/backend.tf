terraform {
  backend "consul" {
    path = "jobs/ipc/state"
  }
}

provider "nomad" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:4646"
}

provider "consul" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:8500"
}
