resource "consul_config_entry_service_defaults" "validator-defaults" {
  name     = "cometbft-validator"
  protocol = "http"
  expose {
    checks = false
  }
}

resource "consul_config_entry_service_defaults" "traefik-defaults" {
  name     = "traefik"
  protocol = "http"
  expose {
    checks = false
  }
}

resource "consul_config_entry_service_defaults" "eth-api-defaults" {
  name     = "eth-api"
  protocol = "http"
  expose {
    checks = false
  }
}

resource "consul_config_entry" "validator-sticky-sessions" {
  name = "cometbft-validator"
  kind = "service-resolver"

  config_json = jsonencode({
    LoadBalancer = {
      Policy = "maglev"
      HashPolicies = [
        {
          Field      = "header"
          FieldValue = "X-Forwarded-For"
        }
      ]
    }
  })
}

resource "consul_config_entry" "eth-api-sticky-sessions" {
  name = "eth-api"
  kind = "service-resolver"

  config_json = jsonencode({
    LoadBalancer = {
      Policy = "maglev"
      HashPolicies = [
        {
          Field      = "header"
          FieldValue = "X-Forwarded-For"
        }
      ]
    }
  })
}
