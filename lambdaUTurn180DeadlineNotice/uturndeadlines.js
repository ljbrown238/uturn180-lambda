var AWS = require('aws-sdk');
var mongoose = require('mongoose');
var utility = require('./utility');
var Schema = mongoose.Schema;

// Create a Schema for Student
var EnrollmentSchema = new Schema({
    _id: [Schema.Types.ObjectId],
    status: {type: String},
    score: {type: Number},
    totalTime: {type: Number},
    createdAt: {type: String},
    lastModified: {type: Date},
    deadline: {type: String},
    id: [Schema.Types.ObjectId],
    studentId: [Schema.Types.ObjectId],
    courseId: [Schema.Types.ObjectId]
}, {collection: 'Enrollment'});

var EnrollmentModel = mongoose.model('Enrollment', EnrollmentSchema, 'Enrollment');


function UTurnDeadlines(context, config, numDaysToDeadline) {

    var numLMSCustomersCompleted = 0;

    this.getStudentsAtNumDaysToDeadline = function(cb) {

        console.log('getStudentsAtNumDaysToDeadline(): config:' + JSON.stringify(config) + ':');
        console.log('getStudentsAtNumDaysToDeadline(): config.uri_mogodb:' + config.uri_mongodb + ':');

        mongoose.connect(config.uri_mongodb, function (err) {

            if (err) {
                console.log('Error: Failed to connect to MongoDB: err:' + JSON.stringify(err) + ':');
                context.done('Error: Failed to connect to MongoDB: err:' + JSON.stringify(err) + ':');
            } else {
                console.log('Connected to MongoDB DB!');


                var time_str = new Date(new Date().getTime() + 1000 * 3600 * 24 * numDaysToDeadline).toISOString().substr(0, 10) + "T00:00:00+00:00";
                console.log('DEBUG: time_str:' + time_str + ':');

                var aggregate_obj = [
                    [
                        {
                            "$match": {
                                "deadline": {
                                    "$eq": time_str
                                }
                            }
                        },
                        {
                            "$lookup": {
                                "from": "Student",
                                "as": "StudentData",
                                "localField": "studentId",
                                "foreignField": "_id"
                            }
                        },
                        {
                            "$unwind": "$StudentData"
                        },
                        {
                            "$project": {
                                "_id": "$StudentData._id",
                                "firstName": "$StudentData.firstName",
                                "lastName": "$StudentData.lastName",
                                "email": "$StudentData.email",
                                "status": "$StudentData.status"
                            }
                        },
                        {
                            "$match": {
                                "$and": [
                                    {
                                        "status": {
                                            "$ne": "completed"
                                        }
                                    },
                                    {
                                        "status": {
                                            "$ne": "locked"
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                ];

                console.log('aggregate_obj:' + JSON.stringify(aggregate_obj) + ':');

                EnrollmentModel.aggregate(aggregate_obj, function (err, db_Enrollments) {

                    if (err) {
                        console.log('Error: Failed to query DB');
                        cb('Error: Failed to query DB');
                    } else {
                        console.log('db_Enrollments: ' + JSON.stringify(db_Enrollments) + ':');

                        // Format:
                        // db_Enrollments: [{"_id":"3.0","firstName":"Loren","lastName":"Brown", "email":"ljbrown238@hotmail.com"}]:

                        var arrayLength = numLMSCustomersCompleted = db_Enrollments.length;

                        if (arrayLength == 0) {
                            console.log('Success: No MongoDB records were returned.');
                        }

                        mongoose.connection.close();

                        cb(null, db_Enrollments);
                    }
                });
            }
        });

    }
}

module.exports = UTurnDeadlines;
