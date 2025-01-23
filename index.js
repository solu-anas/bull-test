const {
  parameters,
  baseUrl,
  closeBrowserInstance,
  createCombos,
  connectDB,
  scout,
  constructQuery,
  delay
} = require("./helpers");

const path = require("path");
const express = require("express");
const { createBullBoard } = require('@bull-board/api');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue, Worker } = require("bullmq");
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');

const run = async (port = 3000) => {
  await connectDB();
  const combos = createCombos(parameters);

  const queuesWithCombos = combos.map((combo) => {
    const queueName = `${Object.entries(combo).map(([key, value]) => `${value}`).join('-')}`;
    const queue = new Queue(queueName, { connection: { host: "localhost", port: 6379 } });
    new Worker(queue.name, path.join(__dirname, "./jobs/taskProcessor.js"), { connection: { host: "localhost", port: 6379 } });
    return { queue, combo };
  });

  // server connection
  const app = express();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/dashboard");

  // add queues to the dashboard
  createBullBoard({
    queues: queuesWithCombos.map(({ queue }) => new BullMQAdapter(queue)),
    serverAdapter
  });

  // middlewares
  app.use("/dashboard", serverAdapter.getRouter());

  app.use("/run", async (req, res) => {
    const throttleRequests = async (queuesWithCombos) => {
      const batchSize = 4; // Process 2 requests at a time
      for (let i = 0; i < queuesWithCombos.length; i += batchSize) {
        const batch = queuesWithCombos.slice(i, i + batchSize);
        await Promise.all(batch.map(async ({ queue, combo }) => {
          const url = constructQuery(baseUrl, combo);
          const result = await scout({ url, context: { useCase: "search" } });
          return queue.add("crawl-job", {
            pageNumber: 1,
            baseUrl,
            combo,
            ...result,
            queueName: queue.name,
          });
        }));
        // await delay(2000); // Wait 2 seconds between batches
      }
    };
    try {
      await throttleRequests(queuesWithCombos);
      return res.json({ message: "Task Jobs Created Successfully" });
    } catch (error) {
      console.error("===x error:", error.message);
      return res.json({ error: `Error Creating Task Jobs: ${error.message} ` });
    }
  });

  app.use("/stop", async (req, res) => {
    try {
      await worker.pause();

      // Pause the queue to prevent new jobs from being processed
      await scrapingQueue.pause();

      // Clean all completed, failed, delayed, and waiting jobs
      await scrapingQueue.clean(0, 'completed');
      await scrapingQueue.clean(0, 'failed');
      await scrapingQueue.clean(0, 'delayed');
      await scrapingQueue.clean(0, 'wait');

      // Empty the queue
      await scrapingQueue.drain(true);
      await closeBrowserInstance();
      return res.json({ success: "stopped" });
    } catch (error) {
      console.error("===x error:", error.message);
      return res.json({ error: `Error Pausing Queue: ${error.message} ` });
    }
  });

  // server setup
  const server = app.listen(port, async () => {
    console.log("===> server listening to port", port);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`===x Port ${port} is Already In Use ...`);
      return run(port + 1);
    } else {
      console.error("===x server error", error.message);
      return process.exit(1);
    }
  });
};

// run
(async () => await run())().catch((err) => console.error("===x error running script:", err.message));