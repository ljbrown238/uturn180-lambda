var AWS = require('aws-sdk');
var utility = require('./utility');
var async = require ('async');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var notices = require('./notices.json');
var UTurnDeadlines = require('./uturndeadlines');
var ses = require('./ses');

// Provide context as a global variable for use in other functions
var context;

// Prepare for event parameters
var s3_bucket;
var s3_object_config;
var numDaysToDeadline;
var sendEmail;
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

    // Get event.numDaysToDeadline parameter
    if (!event.hasOwnProperty('numDaysToDeadline')) {
        console.log('ERROR: event.numDaysToDeadline is not defined!!!');
        context.done('ERROR: event.numDaysToDeadline is not defined!!!');
    } else {
        numDaysToDeadline = event.numDaysToDeadline;
    }

    // Get event.sendEmail parameter
    if (!event.hasOwnProperty('sendEmail')) {
        console.log('ERROR: event.sendEmail is not defined!!!');
        context.done('ERROR: event.sendEmail is not defined!!!');
    } else {
        sendEmail = event.sendEmail;
    }

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

                    // Extract appropriate message
                    subject = notices['notice_' + numDaysToDeadline].subject;
                    body = notices['notice_' + numDaysToDeadline].body;

                    console.log('EMAIL CONTENTS:');
                    console.log('subject:' + subject + ':');
                    console.log('body:' + body + ':');

                    callback(null, config);
                }
            });
        }
    );

    function_array.push(
        function(config, callback) {
            var uturndeadlines = new UTurnDeadlines(context, config, numDaysToDeadline);

            uturndeadlines.getStudentsAtNumDaysToDeadline(function (err, db_Enrollments) {
                if (err) {
                    console.log('ERROR: Failed to obtain students at deadline:' + err + ':');
                    context.done('Error: Failed to obtain students at deadline:' + err + ':');
                } else {
                    console.log('SUCCESS: uturndeadlines.getStudentsAtNumDaysToDeadline completed!');
                    console.log('db_Enrollments:' + JSON.stringify(db_Enrollments) + ':');
                    callback(null, db_Enrollments);
                }
            });
        }
    );

    function_array.push(
        function(enrollments, callback) {
            console.log('Preparing to send emails');

            if (!sendEmail) {
                console.log('sendEmail was false.  NOT ACTUALLY sending emails to customers.');
                callback(null, enrollments);
            } else {

                var waterfallNested = [];

                // First waterfall function is a dummy
                waterfallNested.push(
                    function (cbFirstWaterfallNested) {
                        cbFirstWaterfallNested(null, 'initial dummy waterfall function complete');
                    }
                );

                // firstName and lastName are properties of enrollments in addition to email
                console.log('================================');

                function getSendMessageCallbackFunction(cbWaterfallNestedFinal) {
                    return function (err, data) {
                        if (err) {
                            console.log('ERROR: SES Failed!');
                            console.log(err);
                            cbWaterfallNestedFinal(err, 'ERROR: sendMessage failed!');
                        } else {
                            console.log('SUCCESS: Message Sent!');
                            console.log('MessageId:' + data.MessageId + ':');
                            cbWaterfallNestedFinal(null, 'sendMessage completed!');
                        }
                    }
                }


                function getWaterFallNestedFunction(index) {
                    return function (argFromPreviousWaterfallExecution, cbWaterfallNestedFinal) {
                        console.log('anonymous waterfallNestedFunction[' + index + ']() argFromPreviousWaterfallExecution:' + argFromPreviousWaterfallExecution + ':');
                        console.log('anonymous waterfallNestedFunction[' + index + ']() enrollments[index]:' + JSON.stringify(enrollments[index]) + ':');
                        ses.sendMessage([enrollments[index].email], subject, body, getSendMessageCallbackFunction(cbWaterfallNestedFinal));
                    }
                }


                // Loop over all individuals and send email
                for (var index in enrollments) {
                    if (enrollments.hasOwnProperty(index)) {
                        console.log('>>> SENDING EMAIL: enrollments[' + index + '][email]:' + enrollments[index]['email'] + ':');

                        waterfallNested.push(
                            getWaterFallNestedFunction(index)
                        );
                    }
                }

                function callbackFinalWaterfallNested(err, result) {
                    console.log('callbackFinalWaterfallNested(): result:' + JSON.stringify(result) + ':');
                    callback(null, enrollments);
                }

                async.waterfall(waterfallNested, callbackFinalWaterfallNested);
            }
        }
    );


    function_array.push(
        function(enrollments, callback) {

            console.log('Preparing to send status email:' + JSON.stringify(enrollments) + ':');

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

            var body = numDaysToDeadline + " day deadline emails";

            if (sendEmail) {
                body += " were sent ";
            } else {
                body += " WERE NOT SENT (Testing Only) ";
            }

            body += 'to ' + enrollments.length + ' emails. (ENVIRONMENT:' + s3_object_config + ')\n';

            for (var index in enrollments) {
                if (enrollments.hasOwnProperty(index)) {
                    body += enrollments[index].email + '\n';
                }
            }

            ses.sendMessage(to_array, 'Deadline Emails Sent', body, getSendStatusMessageCallbackFunction(callback));
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




