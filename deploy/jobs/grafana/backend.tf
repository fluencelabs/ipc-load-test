terraform {
  backend "consul" {
    path = "jobs/grafana/state"
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 3.0"
    }
  }
}

provider "consul" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:8500"
}

provider "nomad" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:4646"
}

provider "cloudflare" {}

data "cloudflare_zone" "fluence_dev" {
  name = "fluence.dev"
}
