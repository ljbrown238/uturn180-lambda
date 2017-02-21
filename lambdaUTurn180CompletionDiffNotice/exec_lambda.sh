#!/usr/bin/env bash
aws lambda invoke \
--invocation-type RequestResponse \
--function-name lambdaUTurn180CompletionDiffNotice \
--region us-west-2 \
--log-type Tail \
--payload '{}' \
--profile gdl_uturn180 \
out.txt

