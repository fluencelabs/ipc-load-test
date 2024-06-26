terraform {
  backend "consul" {
    path = "jobs/traefik/state"
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 3.0"
    }

    acme = {
      source  = "vancluever/acme"
      version = "~> 2.0"
    }
  }
}

provider "consul" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:8500"
}

provider "nomad" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:4646"
}
