resource "consul_config_entry" "intentions" {
  name = "eth-api"
  kind = "service-intentions"

  config_json = jsonencode({
    Sources = [
      {
        Action     = "allow"
        Name       = "traefik"
        Precedence = 9
        Type       = "consul"
      },
    ]
  })
}

resource "consul_config_entry" "sticky-sessions" {
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
