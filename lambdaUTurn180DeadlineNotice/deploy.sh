zip -r index.zip node_modules index.js ses.js utility.js notices.json uturndeadlines.js
aws lambda update-function-code --region us-west-2 --function-name lambdaUTurn180DeadlineNotice --zip-file fileb://./index.zip --profile gdl_uturn180
