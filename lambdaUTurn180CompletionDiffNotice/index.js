var AWS = require('aws-sdk');
var utility = require('./utility');
var mongoose = require('mongoose');
var mysql = require('mysql');
var Schema = mongoose.Schema;

if (!utility.is_lambda()) {
    // Do this from CLI, but not from Lambda
    AWS.config.region = 'us-west-2';

    // To set for a particular service client
    AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'gdl_uturn180'});
}

exports.handler = function (event, context, callback) {

    console.log('Lambda function launched');
    console.log('Version 0.4');

    // Ensure we can quit at will
    // context.callbackWaitsForEmptyEventLoop = false;

    // Search Configuration
    var numDaysBack = 7;
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
    s3.getObject({Bucket: 'uturn180-config', Key: 'config_production'}, function(err, data) {

        if (err) {
            console.log('ERROR: Failed to perform s3.getObject:' + err + ':');
            var error = new Error('Error: Failed to perform s3.getObject:' + err + ':');
            callback(error);
        } else {

            config = JSON.parse(new Buffer(data.Body).toString('utf8'));

            mongoose.connect(config.uri_mongodb, function (err) {

                if (err) {
                    console.log('Error: Failed to connect to MongoDB');
                    var error = new Error('Error: Failed to connect to MongoDB');
                    callback(error);
                } else {
                    console.log('Connected to MongoDB DB!');

                    var studentModel = mongoose.model('Student', studentSchema, 'Student');

                    studentModel.find({$and: [{status: "completed"}, {lastModified: {$gte: new Date((new Date()) - 1000 * 60 * 60 * 24 * numDaysBack)}}]}, {email: 1},
                        function (err, db_students) {
                            if (err) {
                                console.log('Error: Failed to query DB');
                                var error = new Error('Error: Failed to query MongoDB');
                                mongoose.disconnect();
                                callback(error);
                            } else {
                                console.log('db_students: ' + JSON.stringify(db_students) + ':');

                                // Format:
                                // db_students: [{"_id":"57f5b46f81635f1300293333","email":"stevevit@me.com"}]:

                                var arrayLength = numLMSStudentsCompleted = db_students.length;

                                if (arrayLength == 0) {
                                    console.log('Success: No MongoDB records were returned.');
                                    mongoose.disconnect();
                                    callback(null, 'Success: No MongoDB records were returned.');
                                } else {

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
                                        host: config.mysql_host,
                                        port: config.mysql_port,
                                        user: config.mysql_user,
                                        password: config.mysql_pass,
                                        database: config.mysql_database
                                    });

                                    conn.connect(function (err) {
                                        if (err) {
                                            console.log('Error: Failed to connect to DB!');
                                            var error = new Error('Error: Failed to connect to DB!');
                                            mongoose.disconnect();
                                            callback(error);
                                        } else {
                                            console.log('Connected to MySQL DB!');

                                            conn.query("SELECT email FROM wp_customer JOIN wp_customer_course on wp_customer.id = wp_customer_course.customer_id WHERE (status != 4) AND (status != 6) AND (course_type = 'Online') AND (email IN " + email_list + ")",
                                                function (err, records) {

                                                    if (err) {
                                                        console.log('Error: Failed to query DB');
                                                        var error = new Error('Error: Failed to query DB');
                                                        mongoose.disconnect();
                                                        callback(error);
                                                    } else {
                                                        console.log('MySQL returned records: ' + JSON.stringify(records) + ':');

                                                        // Create string list of emails
                                                        var arrayLength = records.length;

                                                        if (arrayLength == 0) {
                                                            console.log('Success: No MySQL records were returned.');

                                                            mongoose.disconnect();

                                                            conn.end(function(err) {
                                                                if (err) {
                                                                    console.log(err, err.stack);
                                                                    var error = new Error('Error:' + err + ':');
                                                                    callback(error);
                                                                } else {
                                                                    console.log('MySQL connection ended');
                                                                    callback(null, 'Success: No MySQL records were returned.');
                                                                }
                                                            });
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

                                                            var params = {
                                                                TopicArn: config.topic,
                                                                Subject: subject,
                                                                Message: message + email_list + '\n\n\nStatistics for monitoring DB impact:\n' +
                                                                'num_lms_students_completed_in_range: ' + numLMSStudentsCompleted + '\n'
                                                            };

                                                            sns.publish(params, function (err, data) {
                                                                console.log('Success: Email sent! sns.publish:' + JSON.stringify(data) + ':');

                                                                mongoose.disconnect();

                                                                conn.end(function(err) {
                                                                    if (err) {
                                                                        console.log(err, err.stack);
                                                                        var error = new Error('Error:' + err + ':');
                                                                        callback(error);
                                                                    } else {
                                                                        console.log('MySQL connection ended');
                                                                        callback(null, 'Success: Function complete. Email sent!');
                                                                    }
                                                                })
                                                            })
                                                        }
                                                    }
                                                }
                                            );
                                        }
                                    });
                                }
                            }
                    });
                }
            });
        }
    });
};
