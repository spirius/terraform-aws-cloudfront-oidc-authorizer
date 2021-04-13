locals {
  config = {
    cookieNamePrefix     = var.cookie_name_prefix
    cookieChunkMaxLength = var.cookie_chunk_max_length
    cookieMaxCount       = var.cookie_max_count

    tokenExchangeHeader = var.token_exchange_header
    tokenDeadlineScale  = var.token_deadline_scale

    clientId     = var.client_id
    clientSecret = var.client_secret
    redirectUri  = var.redirect_uri

    issuer                = var.issuer
    tokenEndpoint         = var.token_endpoint != null ? var.token_endpoint : local.well_known_config.token_endpoint
    authorizationEndpoint = var.authorization_endpoint != null ? var.authorization_endpoint : local.well_known_config.authorization_endpoint

    jwks = jsondecode(data.http.jwks.body)
  }

  archive_file_name = (
    var.lambda_code_archive_file != null
    ? var.lambda_code_archive_file
    : "${path.root}/${var.function_name}-lambda.zip"
  )
}

data "archive_file" "lambda_code" {
  type        = "zip"
  output_path = local.archive_file_name

  source {
    filename = "index.js"
    content  = file("${path.module}/lambda-src/index.js")
  }

  source {
    filename = "jwk.js"
    content  = file("${path.module}/lambda-src/jwk.js")
  }

  source {
    filename = "config.json"
    content  = jsonencode(local.config)
  }
}

module "lambda_role" {
  source  = "spirius/iam-role/aws"
  version = "~> 1.0"

  name                 = var.role_name != null ? var.role_name : "${var.function_name}-lambda"
  assume_role_services = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"]
  managed_policy_arns  = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
}

resource "aws_lambda_function" "authorizer" {
  filename         = data.archive_file.lambda_code.output_path
  source_code_hash = data.archive_file.lambda_code.output_base64sha256

  function_name = var.function_name
  role          = module.lambda_role.role.arn
  handler       = "index.handler"

  runtime     = "nodejs12.x"
  timeout     = 5
  memory_size = 128
  publish     = true
}
