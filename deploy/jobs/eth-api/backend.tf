terraform {
  backend "consul" {
    path = "jobs/eth-api/state"
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 3.0"
    }
  }
}

provider "nomad" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:4646"
}

provider "consul" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:8500"
}
