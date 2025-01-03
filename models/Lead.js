const { model, Schema } = require('mongoose');

module.exports = model('Lead', new Schema({
  data: Object,
  metadata: Object,
}));