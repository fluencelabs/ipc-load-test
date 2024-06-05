terraform {
  backend "consul" {
    path = "jobs/seaweedfs/state"
  }

  required_providers {
    postgresql = {
      source = "cyrilgdn/postgresql"
    }
  }
}

provider "consul" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:8500"
}

provider "nomad" {
  address = "http://hashi.${terraform.workspace}.fluence.dev:4646"
}

provider "postgresql" {
  host             = "postgres.${terraform.workspace}.fluence.dev"
  port             = 5433
  expected_version = "14"
  connect_timeout  = 60
  database         = "postgres"
  username         = "postgres"
  password         = "postgres"
  superuser        = false
  sslmode          = "disable"
}
