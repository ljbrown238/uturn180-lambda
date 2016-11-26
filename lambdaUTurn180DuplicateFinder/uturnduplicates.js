var AWS = require('aws-sdk');
var mongoose = require('mongoose');
var utility = require('./utility');
var Schema = mongoose.Schema;

// Create a Schema for Student
var UserSchema = new Schema({
    _id: [Schema.Types.ObjectId],
    name: {type: String},
    email: {type: String},
    password: {type: String},
    token: {type: String},
    roles: {type: String}
}, {collection: 'User'});

var UserModel = mongoose.model('User', UserSchema, 'User');


function UTurnDuplicates(context, config) {

    this.getDuplicateUsers = function(cb) {

        console.log('getDuplicateUsers(): config:' + JSON.stringify(config) + ':');
        console.log('getDuplicateUsers(): config.uri_mogodb:' + config.uri_mongodb + ':');

        mongoose.connect(config.uri_mongodb, function (err) {

            if (err) {
                console.log('Error: Failed to connect to MongoDB: err:' + JSON.stringify(err) + ':');
                context.done('Error: Failed to connect to MongoDB: err:' + JSON.stringify(err) + ':');
            } else {
                console.log('Connected to MongoDB DB!');

                var aggregate_obj = [
                    {"$group" : { "_id": "$email", "count": { "$sum": 1 }, "list": { "$push":{"_id":"$_id","name":"$name"} } } },
                    {"$match": {"_id" :{ "$ne" : null } , "count" : {"$gt": 1} } }
                ];

                console.log('aggregate_obj:' + JSON.stringify(aggregate_obj) + ':');

                // this.db.command({ ... }, function(err, cb){ ... });

                UserModel.aggregate(aggregate_obj, function (err, db_Users) {

                    if (err) {
                        console.log('Error: Failed to query DB');
                        cb('Error: Failed to query DB');
                    } else {
                        console.log('db_Users: ' + JSON.stringify(db_Users) + ':');

                        // Format:
                        // db_Users: [{"_id":"3.0","firstName":"Loren","lastName":"Brown", "email":"ljbrown238@hotmail.com"}]:

                        if (db_Users.length < 1) {
                            console.log('Success: No MongoDB records were returned.');
                        }

                        mongoose.connection.close();

                        cb(null, db_Users);
                    }
                });
            }
        });

    }
}

module.exports = UTurnDuplicates;
