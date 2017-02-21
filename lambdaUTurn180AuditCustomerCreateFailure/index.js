var AWS = require('aws-sdk');
var utility = require('./utility');
var mysql = require('mysql');

// Description: Records where wp_customer_course record was created, but corresponding wp_customer record was not

if (!utility.is_lambda()) {
    // Do this from CLI, but not from Lambda
    AWS.config.region = 'us-west-2';

    // To set for a particular service client
    AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'gdl_uturn180'});
}

exports.handler = function (event, context, callback) {

    console.log('Lambda function lambdaUTurn180AuditCustomerCreateFailure launched');
    console.log('Version 0.3');

    // Search Configuration
    var subject = 'Customer Creation Failure Report: Customer Course Created Without Customer Creation';
    var message = "These are wp_customer_course records where the wp_customer_course entry was created, but the wp_customer record was not:\n\n";

    // Global variables
    var config = {};

    var s3 = new AWS.S3();
    s3.getObject({Bucket: 'uturn180-config', Key: 'config_production'}, function(err, data) {

        if (err) {
            console.log('ERROR: Failed to perform s3.getObject:' + err + ':');
            var error = new Error('Error: Failed to perform s3.getObject:' + err + ':');
            callback(error);
        } else {

            config = JSON.parse(new Buffer(data.Body).toString('utf8'));

            console.log('config:');
            console.log(JSON.stringify(config));

            // Pass to MySQL database to search for all users not matching this state
            conn = mysql.createConnection({
                host     : config.mysql_host,
                port     : config.mysql_port,
                user     : config.mysql_user,
                password : config.mysql_pass,
                database : config.mysql_database
            });

            conn.connect(function(err){
                if(err) {
                    console.log('Error: Failed to connect to DB!');
                    var error = new Error('Error: Failed to connect to DB!');
                    callback(error);
                } else {
                    console.log('Connected to MySQL DB!');
                }

                //
                // This gets all reported records where: a wp_customer_course record has a 0 in the customer_id field
                //  AND delivered_on is not '0000-00-00'
                //  AND opened is '0000-00-00'
                //  AND clicked is '0000-00-00'
                //

                conn.query( "select id, customer_id, order_id, product_id, sku, offense, court, deadline_date, referral_date, completed_date, course_date, registration_date, course_type, enrolled, moodleCourseId, case_number, facility, cancelled, notification_date, notes from wordpress.wp_customer_course where customer_id = 0 and id > 75867 order by id",
                    function(err, records) {

                        console.log('MySQL query callback function called');

                        if(err){
                            console.log('Error: MySQL Failed to query DB');
                            var error = new Error('Error: MySQL Failed to query DB');
                            callback(error);
                        } else {
                            console.log('MySQL returned records: ' + JSON.stringify(records) + ':');
                        }

                        // Create string list of emails
                        var arrayLength = records.length;
                        console.log('records.length = arrayLength = ' + arrayLength + ':');

                        if (arrayLength == 0) {
                            conn.end(function() {
                                console.log('Success: No MySQL records were returned.');
                                callback(null, 'Success: No MySQL records were returned.');
                            });
                        } else {

                            // Parse the result from MySQL and do something about it
                            message += '\nThere were ' + arrayLength + ' records.\n\n';

                            /*
                                 id,
                                 customer_id,
                                 order_id,
                                 registration_date,
                                 course_type,
                                 moodleCourseId,
                                 case_number,
                                 facility,
                             */

                            message += 'id\tcustomer_id\torder_id\tregistration_date\tcourse_type\tmoodleCourseId\tcase_number\tfacility\n';

                            for (var i = 0; i < arrayLength; i++) {
                                console.log('records[' + i + ']:' + JSON.stringify(records[i]) + ':');
                                message += records[i]['id'] + '\t';
                                message += records[i]['customer_id'] + '\t';
                                message += records[i]['order_id'] + '\t';
                                message += records[i]['registration_date'] + '\t';
                                message += records[i]['course_type'] + '\t';
                                message += records[i]['moodleCourseId'] + '\t';
                                message += records[i]['case_number'] + '\t';
                                message += records[i]['facility'] + '\n';
                            }

                            console.log('Compiled Message: message:' + message + ':');

                            conn.end(function() {

                                console.log('Preparing to send Message: message:' + message + ':');

                                // Send notice to SNS topic for email report generation
                                var sns = new AWS.SNS();

                                var params = {
                                    TopicArn: config.topic,
                                    Subject: subject,
                                    Message: message
                                };

                                sns.publish(params, function (err, data) {
                                    if (err) {
                                        console.log(err, err.stack);
                                        var error = new Error('Error:' + err + ':');
                                        message = '';
                                        callback(error);
                                    } else {
                                        message = '';
                                        console.log('sns.publish:' + JSON.stringify(data) + ':');
                                        callback(null, 'Success: Published message to SNS (Email sent!)');
                                    }
                                });
                            });
                        }
                    }
                );
            });
        }
    });
};
