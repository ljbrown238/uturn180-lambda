'use strict';

var SES;

// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
var utility = require('./utility');

(function() {

    // Private instance variable
    var instance;

    // Private variables
    var ses;
    var myFrom = null;

    var numCalls = 0;
    var timerStart = 0;
    var timerStop = 0;
    var timerRunningDuration = 0;

    SES = function SES() {

        // If instance has already been set, return it
        if (instance) {
            return instance;
        } else {
            // This is the first time we are being instantiated.
            // Save the instance!

            if (!utility.is_lambda()) {
                // Do this from CLI, but not from Lambda
                AWS.config.region = 'us-west-2';

                // To set for a particular service client
                AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'gdl_uturn180'});
            }

            // Create an instance of AWS SES
            ses = new AWS.SES();

            instance = this;
        }

        // Private variables can only be set by public methods
        this.setFrom = function(from) {
            myFrom = from;
        };

        this.getTimerDurationAverage = function() {
            if (numCalls != 0) {
                return timerRunningDuration / numCalls;
            } else {
                return undefined;
            }
        };

        this.getNumCalls = function() {
            return numCalls;
        };

        this.getTimerRunningDuration = function() {
            return timerRunningDuration;
        };

        this.sendMessage = function(to, subject, body, callback) {


            if (myFrom == null) {
                callback('Must set "from" email address by calling setFrom(from)!');
                return;
            }

            timerStart = (new Date).getTime();

            // Send the email
            ses.sendEmail( {
                    Source: myFrom,
                    Destination: { ToAddresses: to },
                    Message: {
                        Subject:{
                            Data: subject
                        },
                        Body: {
                            Text: {
                                Data: body
                            }
                        }
                    }
                }
                , function(err, data) {
                    numCalls++;
                    timerStop = (new Date).getTime();
                    timerRunningDuration += timerStop - timerStart;

                    if(err) {
                        callback(err);
                    } else {
                        callback(null, data);
                    }
                });

        };

    };
}());

module.exports = new SES();

