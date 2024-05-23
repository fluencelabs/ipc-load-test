terraform {
  backend "consul" {
    path    = "jobs/dashboard/state"
  }
}

provider "nomad" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:4646"
}
