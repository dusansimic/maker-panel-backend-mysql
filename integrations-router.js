const express = require('express');
const pool = require('./pool');

const integrationsRouter = express.Router(); // eslint-disable-line new-cap

const isInteger = x => (typeof x === 'number') && (x % 1 === 0);
function getType(value) {
	const type = typeof value;

	switch (type) {
		case 'object':
			return value === null ? 'null' : Object.prototype.toString.call(value).match(/^\[object (.*)\]$/)[1];
		case 'function':
			return 'Function';
		case 'number':
			return isInteger(value) ? 'Integer' : 'Float';
		default:
			return type;
	}
}

/**
 * Add app, device and timestamp info to db if not already added and return indexes
 * @param {String} appId Application id
 * @param {String} devId Device id
 * @param {String} timestamp Timestamp of package
 * @param {Object} data Full package json
 * @returns {Object} appIndex, devIndex and packageIndex
 */
async function addPackageToDB(appId, devId, timestamp, data) {
	// Check if app is added into APPLICATION_IDS table
	const applications = await pool.query(`SELECT id FROM APPLICATION_IDS WHERE app_id = '${appId}'`);
	const appExistsInDB = applications.length !== 0;

	if (!appExistsInDB) {
		// Add app and get index in db
		const {insertId: appIndex} = await pool.query(`INSERT INTO APPLICATION_IDS (app_id) VALUES ('${appId}')`);
		// Add device and get index in db
		const {insertId: devIndex} = await pool.query(`INSERT INTO DEVICE_IDS (app_id, dev_id) VALUES ('${appIndex}', '${devId}')`);
		// Add package and get index in db
		const {insertId: packageIndex} = await pool.query(`INSERT INTO PACKAGES (dev_id, timestamp, package_content) VALUES ('${devIndex}', '${timestamp}', '${JSON.stringify(data)}')`);

		return packageIndex;
	}

	// Get app index
	const appIndex = applications[0].id;
	// Get dev index
	const devIndex = (await pool.query(`SELECT id FROM DEVICE_IDS WHERE dev_id = '${devId}' AND app_id = '${appIndex}'`))[0].id;
	// Add package and get index in db
	const {insertId: packageIndex} = await pool.query(`INSERT INTO PACKAGES (dev_id, timestamp, package_content) VALUES ('${devIndex}', '${timestamp}', '${JSON.stringify(data)}')`);

	return packageIndex;
}

integrationsRouter.post('/', async (req, res, next) => {
	try {
		// Get data from body
		const data = req.body;
		// Extract props that are used
		const {app_id: appId, dev_id: devId, metadata, payload_fields: payloadFields} = data;
		const {time: timestamp} = metadata;

		const packageIndex = await addPackageToDB(appId, devId, timestamp, data);

		// Get started with payload
		const hasPayloadFields = Boolean(payloadFields);
		if (hasPayloadFields) {
			// Go through each payload name in the object
			for (const payloadName in payloadFields) { // eslint-disable-line guard-for-in
				/* eslint-disable no-await-in-loop */

				// Insert type into DATA_TYPES only if it doesn't exist
				const {affectedRows, insertId} = await pool.query(`
				INSERT INTO DATA_TYPES (name, type)
				SELECT * FROM (SELECT '${payloadName}', '${getType(payloadFields[payloadName])}') AS temp
				WHERE NOT EXISTS (
					SELECT name FROM DATA_TYPES WHERE name = '${payloadName}'
				) LIMIT 1;
				`);

				// Preset typeIndex if new type was inserted
				let typeIndex = insertId;

				// If new type was not inserted, affectedRows = 0
				// Set typeIndex to correct index
				if (!affectedRows) {
					const response = await pool.query(`SELECT id FROM DATA_TYPES name = '${payloadName}';`);
					const {id} = response[0];
					typeIndex = id;
				}

				// Add value to DATA_LIST table
				await pool.query(`INSERT INTO DATA_LIST (package, type, value) VALUES ('${packageIndex}', '${typeIndex}', '${payloadFields[payloadName]}')`);

				/* eslint-enable no-await-in-loop */
			}
		}

		res.send('ok');
	} catch (error) {
		console.error(error);
		next(error);
	}
});

module.exports = integrationsRouter;
