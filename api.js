const express = require('express');
const restRotuer = require('./rest-router');
const integrationsRouter = require('./integrations-router');

const api = express.Router(); // eslint-disable-line new-cap

api.use('/rest', restRotuer)
api.use('/integrations', integrationsRouter);

module.exports = api;
