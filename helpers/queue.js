const { Queue } = require("bullmq");

let queue;
const getQueue = (combo) => {
  try {
    const queueName = `${Object.entries(combo).map(([key, value]) => `${value}`).join('-')}`;
    if (!queue) {
      queue = new Queue(queueName, { connection: { host: "localhost", port: 6379 } });
    }
    return queue;
  } catch (error) {
    throw new Error(`Error Getting Queue: ${error.message}`);
  }
};

module.exports = { getQueue };