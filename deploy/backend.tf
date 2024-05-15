terraform {
  backend "consul" {
    address = "hashi.fluence.dev:8501"
    scheme  = "https"
    path    = "terraform/stage/ipc-load-test"
  }

  required_providers {
    digitalocean = {
      # https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    cloudflare = {
      # https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs
      source  = "cloudflare/cloudflare"
      version = "~> 3.0"
    }
  }
}

provider "digitalocean" {}
provider "cloudflare" {}

data "cloudflare_zone" "fluence_dev" {
  name = "fluence.dev"
}
