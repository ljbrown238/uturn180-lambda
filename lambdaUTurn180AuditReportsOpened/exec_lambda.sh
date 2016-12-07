#!/usr/bin/env bash
aws lambda invoke \
--invocation-type RequestResponse \
--function-name lambdaUTurn180AuditReportsOpened \
--region us-west-2 \
--log-type Tail \
--payload '{"s3_bucket":"uturn180-config", "s3_object_config":"config_production"}' \
--profile gdl_uturn180 \
out.txt

