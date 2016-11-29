zip -r index.zip node_modules index.js utility.js
aws lambda update-function-code --region us-west-2 --function-name lambdaUTurn180CompletionDiffNotice --zip-file fileb://./index.zip --profile gdl_uturn180
