#!/usr/bin/env bash
zip -r index.zip node_modules index.js utility.js
aws lambda create-function \
--region us-west-2 \
--function-name lambdaUTurn180CompletionDiffNotice \
--zip-file fileb://./index.zip \
--role arn:aws:iam::311492696836:role/lambda_sns_ses_s3 --handler index.handler \
--runtime "nodejs4.3" \
--profile gdl_uturn180 \
--timeout 60
