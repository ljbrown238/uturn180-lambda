var AWS = require('aws-sdk');
var mongoose = require('mongoose');
var mysql = require('mysql');
var Schema = mongoose.Schema;

// Timing
var msec_start = 0;
var msec_mongodb_connect = 0;
var msec_mongodb_query = 0;
var msec_mysql_connect = 0;
var msec_mysql_query = 0;
var msec_stop = 0;

function get_msec() {
    var d = new Date();
    return d.getTime();
}

// Search Configuration
var numDaysBack = 7;
var statusSearch = "completed";
var subject = 'REPORT: Users complete in LMS, but not complete in WP';
var message = 'The following emails are from students whose LMS record has been updated in the last ' + numDaysBack + ' days and whose status is "completed", but whose status in WordPress is not "Completed" and not "Court reported":\n';


// Create a Schema for Student
var studentSchema = new Schema({
    email: {type: String},
    lastModified: {type: Date}
}, {collection: 'Student'});


// Global variables
var numLMSStudentsCompleted = 0;
var config = {};

var s3 = new AWS.S3();

exports.handler = function (event, context, callback) {

    msec_start = get_msec();
    console.log('msec_start:' + msec_start + ':');

    console.log('Lambda function launched');
    console.log('Version 0.3');

    s3.getObject({Bucket: 'uturn180-config', Key: 'config_production'}, function(err, data) {

        if (err) {
            console.log('ERROR: Failed to perform s3.getObject:' + err + ':');
            context.done('Error: Failed to perform s3.getObject:' + err + ':');
        } else {

            config = JSON.parse(new Buffer(data.Body).toString('utf8'));

            mongoose.connect(config.uri_mongodb, function (err) {

                if (err) {
                    console.log('Error: Failed to connect to MongoDB');
                    context.done('Error: Failed to connect to MongoDB');
                } else {
                    msec_mongodb_connect = get_msec();
                    console.log('msec_mongodb_connect:' + msec_mongodb_connect + ':');
                    console.log('Connected to MongoDB DB!');

                    var studentModel = mongoose.model('Student', studentSchema, 'Student');

                    studentModel.find({$and: [{status: statusSearch}, {lastModified: {$gte: new Date((new Date()) - 1000 * 60 * 60 * 24 * numDaysBack)}}]}, {email: 1}, function (err, db_students) {

                        if (err) {
                            console.log('Error: Failed to query DB');
                            context.done('Error: Failed to query MongoDB');
                        } else {
                            msec_mongodb_query = get_msec();
                            console.log('msec_mongodb_query:' + msec_mongodb_query + ':');

                            console.log('db_students: ' + JSON.stringify(db_students) + ':');

                            // Format:
                            // db_students: [{"_id":"57f5b46f81635f1300293333","email":"stevevit@me.com"}]:

                            var arrayLength = numLMSStudentsCompleted = db_students.length;

                            if (arrayLength == 0) {
                                console.log('Success: No MongoDB records were returned.');
                                context.done(null, 'Success: No MongoDB records were returned.');
                            }

                            var email_list = "(";
                            var first = true;

                            for (var i = 0; i < arrayLength; i++) {

                                console.log('db_students[' + i + ']:' + JSON.stringify(db_students[i]) + ':');
                                console.log('db_students[' + i + '][email]:' + db_students[i]['email'] + ':');

                                if (first) {
                                    first = false;
                                    email_list += "'" + db_students[i]['email'] + "'"
                                } else {
                                    email_list += ",'" + db_students[i]['email'] + "'"
                                }
                            }
                            email_list += ")";

                            console.log('MongoDB email_list:' + email_list + ':');

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
                                    msec_mysql_connect = get_msec();
                                    console.log('msec_mysql_connect:' + msec_mysql_connect + ':');
                                    console.log('Connected to MySQL DB!');
                                }

                                conn.query('SELECT email, status FROM wp_customer WHERE (status != 4) AND (status != 6) AND (email IN ' + email_list + ')',
                                    function(err, records) {

                                        if(err){
                                            console.log('Error: Failed to query DB');
                                            callback('Error: Failed to query DB');
                                        } else {
                                            msec_mysql_query = get_msec();
                                            console.log('msec_mysql_query:' + msec_mysql_query + ':');
                                            console.log('MySQL returned records: ' + JSON.stringify(records) + ':');
                                        }

                                        // Create string list of emails
                                        var arrayLength = records.length;

                                        if (arrayLength == 0) {
                                            console.log('Success: No MongoDB records were returned.');
                                            context.done(null, 'Success: No MongoDB records were returned.');

                                        } else {

                                            var email_list = '';

                                            for (var i = 0; i < arrayLength; i++) {
                                                console.log('records[' + i + ']:' + JSON.stringify(records[i]) + ':');
                                                console.log('records[' + i + '][email]:' + records[i]['email'] + ':');

                                                email_list += records[i]['email'] + '\n';
                                            }

                                            console.log('MySQL email_list:' + email_list + ':');

                                            // Send notice to SNS topic for email report generation
                                            var sns = new AWS.SNS();


                                            msec_stop = get_msec();
                                            console.log('msec_stop:' + msec_stop + ':');

                                            var params = {
                                                TopicArn: config.topic,
                                                Subject: subject,
                                                Message: message + email_list + '\n\n\nStatistics for monitoring DB impact:\n' +
                                                'msec_mongodb_connect: ' + (msec_mongodb_connect - msec_start) + ' us\n' +
                                                'msec_mongodb_query: ' + (msec_mongodb_query - msec_mongodb_connect) + ' us\n' +
                                                'msec_mysql_connect: ' + (msec_mysql_connect - msec_mongodb_query) + ' us\n' +
                                                'msec_mysql_query: ' + (msec_mysql_query - msec_mysql_connect) + ' us\n' +
                                                'msec_total: ' + (msec_stop - msec_start) + ' us\n' +
                                                'num_lms_students_completed_in_range: ' + numLMSStudentsCompleted + '\n'
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
                }
            });
        }
    });
};