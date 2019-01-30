const util = require('util');
const mysql = require('mysql');
const Mailgun = require('mailgun-js');
const config = require('./config');
const mailgun = Mailgun({
	apiKey: config.emailNotificationsApiKey,
	domain: config.emailNotificationsDomain
});
const list = mailgun.lists(config.emailNotificationsList);

const pool = mysql.createPool({
	connectionLimit: 10,
	host: config.mysqlHost,
	port: config.mysqlPort,
	user: config.mysqlUser,
	password: config.mysqlPassword,
	database: config.mysqlDatabase
});

pool.getConnection(async (error, connection) => {
	if (error) {
		console.error(error.code)

		try {
			const members = await list.members().list();

			const recipients = members.items.map(obj => obj.address);

			const data = {
				from: 'Maker Panel Backend <makerpanelbackend@maker.rs>',
				to: recipients.join(', '),
				subject: `${error.code}`,
				text: `There was an error on the Maker Panel Backend\n${error.name}\n${error.message}\n${JSON.stringify({...error}, null, '    ')}`
			};

			await mailgun.messages().send(data);
		} catch (error) {
			console.error('error: failed to get members and send email');
			console.error(error);
		}
	}

	if (connection) {
		connection.release();
	}
});

// Make pool query async cuz I like it
pool.query = util.promisify(pool.query);

module.exports = pool;
