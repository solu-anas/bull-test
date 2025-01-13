const {
  parameters,
  baseUrl,
  getMaxResultsAndPages,
  getQueryParams,
  getBrowserInstance,
  closeBrowserInstance,
  handleConsent,
  handleTurnStile,
  handlePopIns,
  handleContext,
  setUpPage,
  scout,
  constructUrlWithParams,
  scrapePage,
  constructQuery,
  createCombos,
  crawlPages,
  getQueue,
  connectDB,
} = require("./helpers");

const path = require("path");
const { Lead } = require("./models");
const express = require("express");
const { createBullBoard } = require('@bull-board/api');
const { Worker } = require("bullmq");
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const mongoose = require("mongoose");

const run = async (port = 3000) => {
  process.on("SIGINT", async () => {
    await closeBrowserInstance();
    console.log("===> process terminated sigint");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await closeBrowserInstance();
    console.log("===> process terminated sigterm");
    process.exit(0);
  });

  // await mongoose.connect("mongodb://localhost:27017/bull-test");
  await connectDB();
  const combos = createCombos(parameters);
  const combo = combos[0];
  const url = constructQuery(baseUrl, combo);
  const scrapingQueue = getQueue(combo);
  const worker = new Worker(scrapingQueue.name, path.join(__dirname, "./processor.js"), { concurrency: 2, connection: { host: "localhost", port: 6379 } });

  // server connection
  const app = express();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/dashboard");

  // add queues to the dashboard
  createBullBoard({ queues: [new BullMQAdapter(scrapingQueue)], serverAdapter });

  // middlewares
  // const browser = await getBrowserInstance();
  app.use("/dashboard", serverAdapter.getRouter());

  app.use("/run", async (req, res) => {
    try {
      const context = { useCase: "search" }
      scout({ url, context })
        .then(async ({ maxResults, maxPages, queryParams }) => {
          // testing
          await scrapingQueue.add("crawl-job", { pageNumber: 1, baseUrl, combo, maxPages, maxResults, queryParams });

          // crawlPages(scrapingQueue, { baseUrl, combo, maxPages, maxResults, queryParams })
          //   .then(() => {
          //     console.log("test");
          //   })
        });

      // immediately sends response after scout() starts
      return res.json({ success: "started" });
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