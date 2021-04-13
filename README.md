# AWS CloudFront Authorizer Terraform module

Terraform module which create a Lambda@Edge function with OIDC integration to provide
authentication and authorization for CloudFront districtuion. It should be configured as `viewer-request`
and `viewer-response` association for the distribution.

The authorizer supports JWK keys verification with `RS256` keys. Tokens are stored
in cookies. Token refresh flow is supported.

## Example

*Note: Lambda@Edge should be in `us-east-1` region.*

```hcl
module "cloudfront_authorizer" {
  providers = {
    aws = aws.us-east-1
  }

  source  = "spirius/cloudfront-oidc-authorizer/aws"
  version = "~> 1.0"

  function_name = "cloudfront-authorizer"

  issuer        = "https://example.com/issuer"
  client_id     = "my-client-id"
  client_secret = "my-client-secret"
  redirect_uri  = "https://the-redirect-url.com"
}

resource "aws_cloudfront_distribution" "dist" {
  ...

  default_cache_behavior {

    lambda_function_association {
      event_type   = "viewer-request"
      lambda_arn   = module.cloudfront_authorizer.lambda.qualified_arn
      include_body = false
    }

    lambda_function_association {
      event_type   = "viewer-response"
      lambda_arn   = module.cloudfront_authorizer.lambda.qualified_arn
      include_body = false
    }

    ...
  }
}
```
