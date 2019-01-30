const express = require('express');
const pool = require('./pool');

const restRouter = express.Router(); // eslint-disable-line new-cap

// eslint-disable-next-line no-useless-escape
const isStringObject = json => /^[\],:{}\s]*$/.test(json.replace(/\\["\\\/bfnrtu]/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:\s*\[)+/g, ''));
const parseAggregatedPayload = data => data.map(obj => {
	let payload = JSON.parse(obj.payload);

	if (!payload) {
		return false;
	}

	payload = payload.map(obj => JSON.parse(obj));
	return payload;
});

restRouter.get('/applications', async (_req, res, next) => {
	try {
		const appList = await pool.query('SELECT * FROM APPLICATION_IDS');

		res.send(appList);
	} catch (error) {
		next(error);
	}
});

restRouter.get('/application/:applicationId/devices', async (req, res, next) => {
	try {
		const {applicationId} = req.params;
		const devicesList = await pool.query(`SELECT * FROM DEVICE_IDS WHERE app_id IN (SELECT id FROM APPLICATION_IDS WHERE app_id = '${applicationId}')`);

		res.send(devicesList);
	} catch (error) {
		next(error);
	}
});

restRouter.get('/application/:applicationId/device/:deviceId', async (req, res, next) => {
	try {
		const {applicationId, deviceId} = req.params;
		let data = await pool.query(`
SELECT PACKAGES.id, PACKAGES.timestamp, JSON_ARRAYAGG(JSON_OBJECT(
	'name', DATA_TYPES.name,
	'type', DATA_TYPES.type,
	'unit', DATA_TYPES.unit,
	'value', DATA_LIST.value
)) AS payload
FROM PACKAGES INNER JOIN DATA_LIST
ON PACKAGES.id = DATA_LIST.package
INNER JOIN DATA_TYPES
ON DATA_TYPES.id = DATA_LIST.type AND PACKAGES.dev_id
IN (SELECT id FROM DEVICE_IDS WHERE dev_id = '${deviceId}' AND app_id
IN (SELECT id FROM APPLICATION_IDS WHERE app_id = '${applicationId}'));
`);

		data = parseAggregatedPayload(data);

		res.send(data);
	} catch (error) {
		next(error);
	}
});

restRouter.get('/application/:applicationId/device/:deviceId/whole', async (req, res, next) => {
	try {
		const {applicationId, deviceId} = req.params;
		let data = await pool.query(`
SELECT IFNULL(JSON_EXTRACT(package_content, '$.payload_fields'), JSON_EXTRACT(package_content, '$.payload_raw')) AS payload FROM PACKAGES WHERE dev_id
IN (SELECT id FROM DEVICE_IDS WHERE dev_id = '${deviceId}' AND app_id
IN (SELECT id FROM APPLICATION_IDS WHERE app_id = '${applicationId}'));
`);

		data = data.map(obj => {
			if (isStringObject(obj.payload)) {
				return JSON.parse(obj.payload);
			}

			return obj.payload;
		});

		res.send(data);
	} catch (error) {
		next(error);
	}
});

module.exports = restRouter;
