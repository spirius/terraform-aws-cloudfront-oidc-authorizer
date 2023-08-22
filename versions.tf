terraform {
  required_version = "~> 1.3"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 3.0, < 6"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }
}
