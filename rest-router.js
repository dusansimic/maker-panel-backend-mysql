const express = require('express');
const moment = require('moment');
const pool = require('./pool');
const util = require('./util');

const restRouter = express.Router(); // eslint-disable-line new-cap

// eslint-disable-next-line no-useless-escape
const isStringObject = json => /^[\],:{}\s]*$/.test(json.replace(/\\["\\\/bfnrtu]/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:\s*\[)+/g, ''));
const parseAggregatedPayload = data => data.map(obj => {
	let payload = JSON.parse(obj.payload);

	if (!payload) {
		return false;
	}

	payload = payload.map(valueObj => {
		valueObj = JSON.parse(valueObj);

		if (valueObj.type === 'Float') {
			valueObj.value = parseFloat(valueObj.value);
		} else if (valueObj.type === 'Integer') {
			valueObj.value = parseInt(valueObj.value, 10);
		}

		delete valueObj.type;

		return valueObj;
	});

	return {
		id: obj.id,
		timestamp: obj.timestamp,
		payload
	};
});
const makeTimestamp = (number, unit) => util.truncateTimestampForMySQL(moment(new Date()).subtract(number, unit).toISOString());
const parsePayload = data => data.map(obj => {
	let {payload, timestamp} = obj;
	if (isStringObject(payload)) {
		payload = JSON.parse(payload);
	}

	return {payload, timestamp};
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
		const count = req.query.count || 30;
		let {timestamp} = req.query;
		if (!timestamp) {
			timestamp = makeTimestamp(30, 'minutes');
		}

		let data = await pool.query(`
SELECT P.id, P.timestamp, JSON_ARRAYAGG(JSON_OBJECT(
	'name', DT.name,
	'type', DT.type,
	'unit', DT.unit,
	'value', DL.value
)) AS payload
FROM PACKAGES P INNER JOIN DATA_LIST DL
ON P.id = DL.package
INNER JOIN DATA_TYPES DT
ON DT.id = DL.type
WHERE P.timestamp > '${timestamp}' AND P.dev_id
IN (SELECT DI.id FROM DEVICE_IDS DI WHERE DI.dev_id = '${deviceId}' AND DI.app_id
IN (SELECT AI.id FROM APPLICATION_IDS AI WHERE AI.app_id = '${applicationId}'))
GROUP BY P.id
LIMIT ${count};
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
		const count = req.query.count || 30;
		let {timestamp} = req.query;
		if (!timestamp) {
			timestamp = makeTimestamp(30, 'minutes');
		}

		const data = await pool.query(`
SELECT IFNULL(JSON_EXTRACT(
	p.package_content, '$.payload_fields'),
	JSON_EXTRACT(p.package_content, '$.payload_raw')
) AS payload, p.timestamp
FROM PACKAGES p
WHERE p.timestamp > '${timestamp}' AND p.dev_id
IN (SELECT dev.id FROM DEVICE_IDS dev WHERE dev.dev_id = '${deviceId}' AND dev.app_id
IN (SELECT app.id FROM APPLICATION_IDS app WHERE app.app_id = '${applicationId}'))
LIMIT ${count};
`);

		const parsedData = parsePayload(data);

		res.send(parsedData);
	} catch (error) {
		next(error);
	}
});

restRouter.get('/application/:applicationId/device/:deviceId/age/:age', async (req, res, next) => {
	try {
		const {applicationId, deviceId, age} = req.params;
		let timestamp;
		if (['day', 'week', 'month', 'year'].includes(age)) {
			timestamp = makeTimestamp(1, age);
		} else {
			return res.send({
				error: 'Time range incorrect!',
				code: 'INPUT_ERROR',
				no: 0
			});
		}

		let count = 60;
		// if (age === 'week') {
		// 	count *= 24;
		// } else if (age === 'month') {
		// 	count *= 24 * 30;
		// } else if (age === 'year') {
		// 	count *= 24 * 365;
		// }

		const data = await pool.query(`
SELECT IFNULL(JSON_EXTRACT(
	p.package_content, '$.payload_fields'),
	JSON_EXTRACT(p.package_content, '$.payload_raw')
) AS payload, p.timestamp
FROM PACKAGES p
WHERE p.timestamp > '${timestamp}' AND p.id MOD ${count} = 0 AND p.dev_id
IN (SELECT dev.id FROM DEVICE_IDS dev WHERE dev.dev_id = '${deviceId}' AND dev.app_id
IN (SELECT app.id FROM APPLICATION_IDS app WHERE app.app_id = '${applicationId}'));
`);

		const parsedData = parsePayload(data);

		res.send(parsedData);
	} catch (error) {
		next(error);
	}
});

restRouter.get('/application/:applicationId/device/:deviceId/location', async (req, res, next) => {
	try {
		const {applicationId, deviceId} = req.params;

		const data = await pool.query(`
SELECT JSON_EXTRACT(p.package_content, '$.payload_fields.latitude') as latitude, JSON_EXTRACT(p.package_content, '$.payload_fields.longitude') as longitude
FROM PACKAGES p
WHERE p.id = (SELECT MAX(p1.id) FROM PACKAGES p1 WHERE p1.dev_id
	IN (SELECT di.id FROM DEVICE_IDS di WHERE di.dev_id = '${deviceId}' AND di.app_id
		IN (SELECT ai.id FROM APPLICATION_IDS ai WHERE ai.app_id = '${applicationId}')))
LIMIT 1;
`);

		const location = data[0];

		if (location.latitude === null || location.longitude === null) {
			return res.send({
				error: 'Location not found!',
				code: 'DATA_NOT_FOUND',
				no: 0
			});
		}

		res.send(location);
	} catch (error) {
		next(error);
	}
});

restRouter.get('/count/:subject', async (req, res, next) => {
	try {
		const {subject} = req.params;

		let data;
		if (subject === 'packages') {
			let {timestamp} = req.query;
			if (!timestamp) {
				timestamp = makeTimestamp(30, 'minutes');
			}

			data = await pool.query(`SELECT COUNT(*) AS count FROM PACKAGES WHERE timestamp > '${timestamp}';`);
		} else if (subject === 'applications') {
			data = await pool.query('SELECT COUNT(id) AS count FROM APPLICATION_IDS;');
		} else if (subject === 'devices') {
			data = await pool.query('SELECT COUNT(id) AS count FROM DEVICE_IDS;');
		} else {
			return res.send({
				error: 'Invalid subject!',
				code: 'INPUT_ERROR',
				no: 1
			});
		}

		res.send(data[0]);
	} catch (error) {
		next(error);
	}
});

module.exports = restRouter;
