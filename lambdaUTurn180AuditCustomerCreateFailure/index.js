var AWS = require('aws-sdk');
var utility = require('./utility');
var mysql = require('mysql');

// Timing
var msec_start = 0;
var msec_mysql_connect = 0;
var msec_mysql_query = 0;
var msec_stop = 0;

// Description: Records where wp_customer_course record was created, but corresponding wp_customer record was not

// Search Configuration
var subject = 'Customer Creation Failure Report: Customer Course Created Without Customer Creation';
var message = "These are wp_customer_course records where the wp_customer_course entry was created, but the wp_customer record was not:\n\n";


// Global variables
var config = {};

if (!utility.is_lambda()) {
    // Do this from CLI, but not from Lambda
    AWS.config.region = 'us-west-2';

    // To set for a particular service client
    AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'gdl_uturn180'});
}

var s3 = new AWS.S3();

exports.handler = function (event, context, callback) {

    msec_start = utility.get_msec();
    console.log('msec_start:' + msec_start + ':');

    console.log('Lambda function lambdaUTurn180AuditCustomerCreateFailure launched');
    console.log('Version 0.1');

    s3.getObject({Bucket: 'uturn180-config', Key: 'config_production'}, function(err, data) {

        if (err) {
            console.log('ERROR: Failed to perform s3.getObject:' + err + ':');
            context.done('Error: Failed to perform s3.getObject:' + err + ':');
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
                    callback('Error: Failed to connect to DB!');
                } else {
                    msec_mysql_connect = utility.get_msec();
                    console.log('msec_mysql_connect:' + msec_mysql_connect + ':');
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

                        if(err){
                            console.log('Error: Failed to query DB');
                            callback('Error: Failed to query DB');
                        } else {
                            msec_mysql_query = utility.get_msec();
                            console.log('msec_mysql_query:' + msec_mysql_query + ':');
                            console.log('MySQL returned records: ' + JSON.stringify(records) + ':');
                        }

                        // Create string list of emails
                        var arrayLength = records.length;

                        if (arrayLength == 0) {
                            console.log('Success: No MongoDB records were returned.');
                            context.done(null, 'Success: No MongoDB records were returned.');

                        } else {

                            // Parse the result from MySQL and do something about it
                            var data_array = [];

                            message += 'There were ' + arrayLength + ' records.\n\n';
                            /*

                             id,
                             customer_id,
                             order_id,
                             product_id,
                             sku,
                             offense,
                             court,
                             deadline_date,
                             referral_date,
                             completed_date,
                             course_date,
                             registration_date,
                             course_type,
                             enrolled,
                             moodleCourseId,
                             case_number,
                             facility,
                             cancelled,
                             notification_date,
                             notes



                             */
                            message += 'id\tcustomer_id\torder_id\tregistration_date\tcourse_type\tmoodleCourseId\tcase_number\tfacility\n';

                            for (var i = 0; i < arrayLength; i++) {
                                console.log('records[' + i + ']:' + JSON.stringify(records[i]) + ':');
                                data_array[i] = records[i]['id'] + '\t';
                                data_array[i] += records[i]['customer_id'] + '\t';
                                data_array[i] += records[i]['order_id'] + '\t';
                                data_array[i] += records[i]['registration_date'] + '\t';
                                data_array[i] += records[i]['course_type'] + '\t';
                                data_array[i] += records[i]['moodleCourseId'] + '\t';
                                data_array[i] += records[i]['case_number'] + '\t';
                                data_array[i] += records[i]['facility'];
                            }

                            message += data_array.join('\n');

                            console.log('message:');
                            console.log(message);


                            // Send notice to SNS topic for email report generation
                            var sns = new AWS.SNS();


                            msec_stop = utility.get_msec();
                            console.log('msec_stop:' + msec_stop + ':');



                            var params = {
                                TopicArn: config.topic,
                                Subject: subject,
                                Message: message
                            };

                            sns.publish(params, function (err, data) {
                                if (err) {
                                    console.log(err, err.stack);
                                    context.done('Error:' + err + ':');
                                } else {
                                    console.log('sns.publish:' + JSON.stringify(data) + ':');
                                    context.done(null, 'Success: Email sent!');
                                }
                            });
                        }

                    }
                );
            });
        }
    });
};
