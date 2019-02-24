const moment = require('moment');

console.log(moment(new Date()).subtract(1, 'week').toISOString().replace('T', ' ').replace('Z', ''));
