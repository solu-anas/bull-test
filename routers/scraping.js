const { createBullBoard } = require('@bull-board/api');
const { ExpressAdapter } = require('@bull-board/express');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { queueName } = require("../jobs/scrapingProcessor");
const { Queue } = require("bullmq");

const serverAdapter = new ExpressAdapter();
let queues = [];
if (queueName) {
  queues = [new BullMQAdapter(new Queue(queueName, { connection: { host: "localhost", port: 6379 } }))];
};

createBullBoard({ queues, serverAdapter });
serverAdapter.setBasePath("/scraping");

module.exports = serverAdapter.getRouter();