require("dotenv").config();

module.exports = {
  environment: process.env.NODE_ENV,
  apiCredentials: process.env.SMART_PROXY_API,
};