const browser = require('./browser');
const page = require('./page');
const values = require('./values');

module.exports = { ...browser, ...page, ...values };