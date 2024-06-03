resource "consul_config_entry" "cometbft" {
  name = "cometbft"
  kind = "service-intentions"

  config_json = jsonencode({
    Sources = [
      {
        Action     = "allow"
        Name       = "traefik"
        Precedence = 9
        Type       = "consul"
      },
      {
        Action     = "allow"
        Name       = "eth-api"
        Precedence = 9
        Type       = "consul"
      },
    ]
  })
}

resource "consul_config_entry" "sticky-sessions" {
  name = "cometbft"
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
