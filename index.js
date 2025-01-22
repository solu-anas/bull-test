const {
  parameters,
  closeBrowserInstance,
  createCombos,
  connectDB,
} = require("./helpers");

const {
  crawlingRouter,
  scrapingRouter,
} = require("./routers");

const path = require("path");
const express = require("express");
const { createBullBoard } = require('@bull-board/api');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue, Worker } = require("bullmq");
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');

const run = async (port = 3000) => {
  await connectDB();
  const combos = createCombos(parameters);

  const taskQueue = new Queue(
    "tasks",
    { connection: { host: "localhost", port: 6379 } }
  );
  new Worker(taskQueue.name, path.join(__dirname, "./jobs/taskProcessor.js"), { concurrency: 2, connection: { host: "localhost", port: 6379 } });

  // server connection
  const app = express();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/dashboard");

  // add queues to the dashboard
  createBullBoard({
    queues: [new BullMQAdapter(taskQueue)],
    serverAdapter
  });

  // middlewares
  app.use("/dashboard", serverAdapter.getRouter());
  app.use("/crawling", crawlingRouter);
  app.use("/scraping", scrapingRouter);

  app.use("/run", async (req, res) => {
    try {
      const tasks = combos.map((combo) => ({ name: `task-of-${Object.entries(combo).map(([key, value]) => `${value}`).join('-')}`, data: { combo } }));
      await taskQueue.addBulk(tasks);
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