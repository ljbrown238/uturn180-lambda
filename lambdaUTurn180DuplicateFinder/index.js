var AWS = require('aws-sdk');
var utility = require('./utility');
var async = require ('async');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var UTurnDuplicates = require('./uturnduplicates');
var ses = require('./ses');

// Provide context as a global variable for use in other functions
var context;

// Prepare for event parameters
var s3_bucket;
var s3_object_config;
var debugStatusEmail;

if (!utility.is_lambda()) {
    // Do this from CLI, but not from Lambda
    AWS.config.region = 'us-west-2';

    // To set for a particular service client
    AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'gdl_uturn180'});
}


// This is the 'main' of the Lambda function
exports.handler = function (event, local_context, callback) {

    console.log('Lambda function launched');

    console.log('event:' + JSON.stringify(event) + ':');

    // Make context reachable by functions outside this scope
    context = local_context;

    //
    // Get event parameters
    //

    // Get event.s3_object_config parameter
    if (!event.hasOwnProperty('s3_object_config')) {
        console.log('ERROR: event.s3_object_config is not defined!!!');
        context.done('ERROR: event.s3_object_config is not defined!!!');
    } else {
        s3_object_config = event.s3_object_config;
    }

    // Get event.s3_bucket parameter
    if (!event.hasOwnProperty('s3_bucket')) {
        console.log('ERROR: event.s3_bucket is not defined!!!');
        context.done('ERROR: event.s3_bucket is not defined!!!');
    } else {
        s3_bucket = event.s3_bucket;
    }

    // Get event.debugStatusEmail parameter
    if (!event.hasOwnProperty('debugStatusEmail')) {
        console.log('ERROR: event.debugStatusEmail is not defined!!!');
        context.done('ERROR: event.debugStatusEmail is not defined!!!');
    } else {
        debugStatusEmail = event.debugStatusEmail;
    }


    var subject, body, from, to_array;

    if (debugStatusEmail) {
        // Email address related to a verified SES account
        from = 'ljbrown238@hotmail.com';
        to_array = ['ljbrown238@gmail.com'];
    } else {
        from = 'SavingLives@UTurn180.com';
        to_array = ['SavingLives@UTurn180.com', 'ljbrown238@gmail.com'];
    }


    function_array = [];

    // Get configuration parameters
    function_array.push(
        function(callback){
            var s3 = new AWS.S3();

            s3.getObject({Bucket: s3_bucket, Key: s3_object_config}, function(err, data) {

                if (err) {
                    console.log('ERROR: Failed to perform s3.getObject:' + err + ':');
                    context.done('Error: Failed to perform s3.getObject:' + err + ':');
                } else {
                    console.log('SUCCESS: s3.getObject completed!');
                    config = JSON.parse(new Buffer(data.Body).toString('utf8'));

                    callback(null, config);
                }
            });
        }
    );

    function_array.push(
        function(config, callback) {
            var uturnduplicates = new UTurnDuplicates(context, config);

            uturnduplicates.getDuplicateUsers(function (err, duplicate_users) {
                if (err) {
                    console.log('ERROR: Failed to obtain students at deadline:' + err + ':');
                    context.done('Error: Failed to obtain students at deadline:' + err + ':');
                } else {
                    console.log('SUCCESS: uturnduplicates.getDuplicateUsers completed!');
                    console.log('duplicate_users:' + JSON.stringify(duplicate_users) + ':');
                    callback(null, duplicate_users);
                }
            });
        }
    );

    function_array.push(
        function(duplicate_users, callback) {

            console.log('Preparing to send status email:' + JSON.stringify(duplicate_users) + ':');

            function getSendStatusMessageCallbackFunction(cbWaterfallFinal) {
                return function (err, data) {
                    if (err) {
                        console.log('ERROR: SES Failed!  err:' + err + ':');
                        cbWaterfallFinal(err, 'ERROR: sendMessage failed!');
                    } else {
                        console.log('SUCCESS: Message Sent!  MessageId:' + data.MessageId + ':');
                        cbWaterfallFinal(null, 'sendMessage Status Message completed!');
                    }
                }
            }

            var body = '';

            if (duplicate_users.length > 0) {
                body = "Duplicate Users exist in User Collection!\n\n";

                var t1 = duplicate_users.length > 1 ? 'are' : 'is';
                var t2 = duplicate_users.length > 1 ? 's' : '';

                body += 'There ' + t1 + ' ' + duplicate_users.length + ' duplicate user' + t2 + ' in the ' + s3_object_config.split("_")[1] + ' environment.\n';

                for (var index in duplicate_users) {
                    if (duplicate_users.hasOwnProperty(index)) {
                        body += duplicate_users[index]._id + '\n';
                    }
                }

                body += "\n\n\n";
                body += "For Debug Reference:\n\n";
                body += JSON.stringify(duplicate_users) + '\n';
            } else {
                body += 'NO duplicate users were discovered in the ' + s3_object_config.split("_")[1] + ' environment.\n';
            }

            console.log('Email body:' + body + ':');

            // to, subject, body, callback
            ses.sendMessage(to_array, 'UTurn180 LMS Duplicate User Query Result', body, getSendStatusMessageCallbackFunction(callback));
        }
    );

    function callbackFinal(err, result) {
        console.log('callbackFinal(): result:' + JSON.stringify(result) + ':');
        console.log('LAMBDA FUNCTION COMPLETE!!!');
        context.done(null, 'Lambda function complete!!!');
    }


    // Initialize SES
    ses.setFrom(from);

    async.waterfall(function_array, callbackFinal);

};




