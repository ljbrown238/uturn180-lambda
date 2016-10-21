# README #

### Description ###
This repository contains AWS Lambda functions designed to perform various functions outside of WP and LMS.
These functions are primarily reporting and notification in nature, but could be eventually extended to others as well.

Each of these functions will depend on configuration information (credentials, etc.) being present in S3.
The location and format are as follows:

#### Bucket ####
uturn180-config

#### Files ####
config_production or config_staging

#### File Format: JSON ####

Keys:

* uri_mongodb
* mysql_host
* mysql_port
* mysql_user
* mysql_pass
* mysql_database
* topic

#### Security ####
These files are only accessible by roles with access to S3.
In particular, the Lambda functions should be set up with the role with inherent access to S3 and SNS: lambda_sns_s3


### Deployment Process for uturn180-lambda ###

Each lambda function will need to be deployed on its own.
Currently, the mechanism to deploy is to zip the current folder and manually upload the zip file to the lambda function using the AWS UI.

A scripted process will be implemented soon.
