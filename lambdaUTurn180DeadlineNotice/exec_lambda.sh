aws lambda invoke \
--invocation-type RequestResponse \
--function-name lambdaUTurn180DeadlineNotice \
--region us-west-2 \
--log-type Tail \
--payload '{"s3_bucket":"uturn180-config", "s3_object_config":"config_production", "numDaysToDeadline":0, "sendEmail":false, "debugStatusEmail":false}' \
--profile gdl_uturn180 \
out.txt

