var AWS = require('aws-sdk');
var utility = require('./utility');
var mysql = require('mysql');

// Timing
var msec_start = 0;
var msec_mysql_connect = 0;
var msec_mysql_query = 0;
var msec_stop = 0;

// Description: Records where the report run occurred, and it was delivered, but the email was neither opened nor the link clicked on

// Search Configuration
var subject = 'REPORTING AUDIT REPORT: Reports sent but not opened';
var message = "Records where the report run occurred, and it was delivered, but the email was neither opened nor the link clicked on:\n\n";


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

    console.log('Lambda lambdaUTurn180AuditReportsOpened function launched');
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
                // This gets all reported records where: The run happened and it was delivered, but the email was neither opened nor the link clicked on
                //  run_date is not null
                //  AND delivered_on is not '0000-00-00'
                //  AND opened is '0000-00-00'
                //  AND clicked is '0000-00-00'
                //

                conn.query(
                    "SELECT wp_court.name as court_name, wp_court_report.run_date, wp_court.contact_name, wp_court.contact_email, wp_court.contact_phone, wp_court_report.name as report_name, wp_court_report.delivered_to, wp_court_report.description, wp_court_report.delivered_on, wp_court_report.opened_on, wp_court_report.clicked_on FROM wordpress.wp_court_report JOIN wp_court on wp_court.id = wp_court_report.court_id where (run_date is not null and wp_court_report.delivered_on != '0000-00-00') and (wp_court_report.opened_on = '0000-00-00' and wp_court_report.clicked_on = '0000-00-00') Order by wp_court.id, wp_court_report.run_date",
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
                            message += 'court_name\trun_date\tcontact_name\tcontact_email\tcontact_phone\treport_name\tdelivered_to\tdescription\tdelivered_on\topened_on\tclicked_on\n';

                            for (var i = 0; i < arrayLength; i++) {
                                console.log('records[' + i + ']:' + JSON.stringify(records[i]) + ':');
                                data_array[i] = records[i]['court_name'] + '\t';
                                data_array[i] += records[i]['run_date'] + '\t';
                                data_array[i] += records[i]['contact_name'] + '\t';
                                data_array[i] += records[i]['contact_email'] + '\t';
                                data_array[i] += records[i]['contact_phone'] + '\t';
                                data_array[i] += records[i]['report_name'] + '\t';
                                data_array[i] += records[i]['delivered_to'] + '\t';
                                data_array[i] += records[i]['description'] + '\t';
                                data_array[i] += records[i]['delivered_on'] + '\t';
                                data_array[i] += records[i]['opened_on'] + '\t';
                                data_array[i] += records[i]['clicked_on'];
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
