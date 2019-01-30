const express = require('express');
const restRouter = require('./rest-router');
const integrationsRouter = require('./integrations-router');

const api = express.Router(); // eslint-disable-line new-cap

api.use('/rest', restRouter)
api.use('/integrations', integrationsRouter);

module.exports = api;
