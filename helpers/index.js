const browser = require('./browser');
const page = require('./page');
const values = require('./values');
const utils = require('./utils');
const queue = require('./queue');
const db = require('./db');
const env = require('./env');

module.exports = { ...db, ...queue, ...browser, ...page, ...values, ...utils, ...env };