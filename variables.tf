variable "cookie_name_prefix" {
  description = "The cookie name prefix used for storing tokens."
  default     = "TOKEN_"
}

variable "cookie_chunk_max_length" {
  description = "Max length of the single cookie."
  default     = 2048
}

variable "cookie_max_count" {
  description = "Max count of cookies."
  default     = 8
}

variable "token_exchange_header" {
  description = "Internal header name used for exchaning access tokens."
  default     = "X-New-Token"
}

variable "token_deadline_scale" {
  description = "The coefficient of how soon token will be refreshed before expiration."
  default     = 0.95
}

variable "issuer" {
  description = "OIDC issuers URL."
}

variable "token_endpoint" {
  description = "OIRC token endpoint URL. If not specified will take the value from well-known config."
  default     = null
}

variable "authorization_endpoint" {
  description = "OIDC authorization endpoint URL. If not specified will take the value from well-known config."
  default     = null
}

variable "client_id" {
  description = "OIDC client id."
}

variable "client_secret" {
  description = "OIDC client secret."
}

variable "redirect_uri" {
  description = "OIDC redirect URI."
}

variable "function_name" {
  description = "The lambda function name."
}

variable "role_name" {
  description = "The IAM role name of lambda. If not specified $${function_name}-lambda is used."
  default     = null
}

variable "lambda_code_archive_file" {
  description = "The file path where the lambda code archive file will be created. Default is $${path.root}/$${function_name}-lambda.zip."
  default     = null
}

variable "viewer_request_handler" {
  description = "Additional JavaScript code to process the viewer-request event. The code should export a function (or async function) with `module.exports = (event, res) => ...`."
  default     = null
}

variable "viewer_response_handler" {
  description = "Additional JavaScript code to process the viewer-resposne event. The code should export a function (or async function) with `module.exports = (event, res) => ...`."
  default     = null
}
