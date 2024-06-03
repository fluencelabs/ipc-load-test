provider "acme" {
  server_url = "https://acme-v02.api.letsencrypt.org/directory"
}

resource "tls_private_key" "acme" {
  algorithm = "RSA"
}

resource "acme_registration" "fluence" {
  account_key_pem = tls_private_key.acme.private_key_pem
  email_address   = "devops@fluence.one"
}

resource "acme_certificate" "cert" {
  account_key_pem = acme_registration.fluence.account_key_pem
  common_name     = "*.${terraform.workspace}.fluence.dev"

  dns_challenge {
    provider = "cloudflare"
  }
}

resource "consul_keys" "cert" {
  key {
    path   = "certs/fluence.dev/private_key"
    value  = acme_certificate.cert.private_key_pem
    delete = true
  }

  key {
    path   = "certs/fluence.dev/ca_bundle"
    value  = "${acme_certificate.cert.certificate_pem}${acme_certificate.cert.issuer_pem}"
    delete = true
  }

  key {
    path   = "certs/fluence.dev/cert"
    value  = acme_certificate.cert.certificate_pem
    delete = true
  }
}
