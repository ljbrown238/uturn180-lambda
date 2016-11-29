
module.exports = {
    get_msec: function() {
        var d = new Date();
        return d.getTime();
    },
    is_lambda: function() {
        return process.env.hasOwnProperty('LAMBDA_TASK_ROOT');
    }
};

