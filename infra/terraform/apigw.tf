# -----------------------------------------------------------------------
# M4 — API Gateway HTTP API
# Routes: POST /clean → Lambda / GET /jobs/{id} → Lambda
# CORS: allow_origins=["*"]（demo / 學期用；PLAN_E11 npm publish 前可收窄）
# Auth: 不做（hardcoded Learner Lab demo endpoint、不對外）
# -----------------------------------------------------------------------

resource "aws_apigatewayv2_api" "tdcs_dl" {
  name          = "tdcs-dl-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST"]
    allow_headers = ["content-type"]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id             = aws_apigatewayv2_api.tdcs_dl.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.cleaner.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_clean" {
  api_id    = aws_apigatewayv2_api.tdcs_dl.id
  route_key = "POST /clean"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "get_job" {
  api_id    = aws_apigatewayv2_api.tdcs_dl.id
  route_key = "GET /jobs/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.tdcs_dl.id
  name        = "$default"
  auto_deploy = true

  # 不另建 log group — 沿用 Lambda 同一個（demo 量小、單 log group 足夠）
  # PLAN_E11 UX 打磨時可分開，方便查 API vs Lambda log
}

resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleaner.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.tdcs_dl.execution_arn}/*/*"
}
