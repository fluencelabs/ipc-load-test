terraform {
  backend "consul" {
    path = "jobs/prometheus/state"
  }
}

provider "consul" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:8500"
}

provider "nomad" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:4646"
}
