data "http" "well_known_config" {
  url = "${var.issuer}/.well-known/openid-configuration"

  request_headers = {
    Accept = "application/json"
  }
}

locals {
  well_known_config = jsondecode(data.http.well_known_config.body)
}

data "http" "jwks" {
  url = local.well_known_config.jwks_uri

  request_headers = {
    Accept = "application/json"
  }
}
