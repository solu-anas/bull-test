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
  scout
} = require("./helpers");

const { Lead } = require("./models");
const { Queue, Worker } = require("bullmq");
const express = require("express");
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const mongoose = require("mongoose");

const createCombos = (parameters) => {
  const combos = [];

  const generate = (currentCombo, depth) => {
    if (depth === parameters.length) {
      combos.push(currentCombo);
      return;
    }

    const { alias, values } = parameters[depth];
    values.forEach((value) => {
      generate({ ...currentCombo, [alias]: value }, depth + 1);
    });
  };

  generate({}, 0);
  return combos;
};

const constructQuery = (baseUrl, combo, contexte = undefined, pageNumber = undefined) => {
  try {
    const constructed = `${baseUrl}?${Object.entries(combo).map(([key, value]) => `${key}=${value}`).join('&')}`;
    if (contexte && pageNumber) {
      return constructed.concat(`&contexte=${contexte}&page=${pageNumber}`);
    };
    return constructed;
  } catch (error) {
    throw new Error(`Error Constructing Query: ${error.message}`);
  }
};

const constructUrlWithParams = (baseUrl, queryParams) => {
  try {
    return `${baseUrl}?${Object.entries(queryParams).map(([key, value]) => `${key}=${value}`).join('&')}`;
  } catch (error) {
    throw new Error(`Error Constructing Url With Params: ${error.message}`);
  }
};

const crawlPages = async (scrapingQueue, { pageNumber = 1, baseUrl, combo, maxPages, maxResults, queryParams }) => {
  try {
    // const { contexte } = queryParams;
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    console.log(`page: ${pageNumber} of ${maxPages}`);
    if (pageNumber <= maxPages) {
      const url = constructUrlWithParams(baseUrl, { ...combo, ...queryParams, page: pageNumber });
      const context = { useCase: "search" };
      await setUpPage(page, { url, context });
      queryParams = await handleContext(url, queryParams, { context });
      await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
      await handleConsent(page, { context, withDelay: false });
      await handlePopIns(page, { context, withDelay: false });
      // extract pjId and save to database
      const pjIds = await page.$$eval('#listResults ul li', (elements) => {
        return elements
          .filter(({ id }) => !!id)
          .map((element) => element?.id?.split("bi-")[1].trim());
      });

      // we are here
      pjIds.forEach((pjId) => console.log("===> pjId:", pjId));
      const createLeadsForJob = pjIds.map((pjId) => {
        const lead = new Lead({ data: { pjId } });
        return Promise.all([
          // saving promise
          lead.save(),
          // scraping promise
          scrapingQueue.add(`scraping-of-${pjId}`, { leadId: lead._id.toHexString(), pjId: lead.data.pjId }),
        ]
        );
      });
      // woah
      await Promise.all(createLeadsForJob);

      // increment page number and crawl next page
      queryParams.page = pageNumber++;
      await crawlPages(scrapingQueue, { pageNumber, baseUrl, combo, maxPages, maxResults, queryParams });
    }
    // always close page after use
    await page.close();
    return { success: `Crawled Pages of Combo: ${JSON.stringify(combo)} Successfully` };
  } catch (error) {
    await closeBrowserInstance();
    throw new Error(`Error Crawling Page: ${error.message}`);
  }
};

const scrapePage = async (page) => {
  let name = "", phone = "", address = "", website = "", brands = "", workingHours = "", legalInfo = "";
  try {
    // extract data
    name = await page.$$eval('.header-main-infos .denom h1.noTrad', (element) => element[0]?.innerText.trim() || "");
    phone = await page.$$eval('span.nb-phone span.coord-numero', (element) => element[0]?.innerText.trim().toLowerCase() || "");
    address = await page.$$eval('.address-container span.noTrad', (element) => element[0]?.innerText.trim().toLowerCase() || "");
    website = await page.$$eval('.lvs-container span.value', (element) => element[0]?.innerText.trim() || "");
    brands = await page.$$eval('.marques ul.liste-logos li', (elements) => {
      return elements.map((element) => element?.innerText.trim() || "");
    });
    workingHours = await page.$$eval('.zone-informations-pratiques #bloc-horaires #infos-horaires ul.liste-horaires-principaux li', (elements) => {
      return elements.map((element) => {
        const day = element.querySelector('p.jour')?.innerText?.trim() || "";
        const hours = element.querySelector('p.liste span.horaire')?.innerText?.trim().split(" - ") || [];
        return { day, hours };
      })
    });

    legalInfo = await page.evaluate(() => {
      const establishmentInfo = {};
      const companyInfo = {};

      // Extract establishment data
      const establishmentElements = document.querySelectorAll('.info-etablissement dt');
      establishmentElements.forEach(dt => {
        const key = dt.textContent.trim();
        const value = dt.nextElementSibling.querySelector('strong')?.textContent.trim() || '';
        establishmentInfo[key] = value;
      });

      // Extract company data
      // eslint-disable-next-line no-undef
      const companyElements = document.querySelectorAll('.info-entreprise dt');
      companyElements.forEach(dt => {
        const key = dt.textContent.trim();
        const value = dt.nextElementSibling.querySelector('strong')?.textContent.trim() || '';
        companyInfo[key] = value;
      });
      return { establishmentInfo, companyInfo };
    });
  } catch (error) {
    throw new Error(`Error Scraping Data: ${error.message}`);
  }
  return { name, phone, address, website, brands, workingHours, legalInfo };
};

const scrapingProcessor = async (job) => {
  try {
    const { leadId, pjId } = job.data;
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    const url = `https://www.pagesjaunes.fr/pros/${pjId}`;
    const context = { useCase: "lead", job };
    await setUpPage(page, { url, context });
    await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
    const scrapedData = await scrapePage(page);
    const updates = {};
    // TOREVISE: do more calculations, make the job return a report of what it collected
    Object.entries(scrapedData).forEach(([key, value]) => {
      if (value) {
        updates[`data.${key}`] = value;
      }
    });
    if (Object.keys(updates).length !== 0) {
      const lead = await Lead.findByIdAndUpdate(leadId, updates, { new: true });
      if (!lead) {
        job.log(`lead ${pjId} not found, creating new instance...`);
        const newLead = new Lead({ data: { pjId, ...updates } });
        await newLead.save();
      }
    };
    // always close page after use
    await page.close();
    return { success: `Scraped Data of Lead: ${pjId} Successfully` };
  } catch (error) {
    job.log(`Error Scraping Data: ${error.message}`);
    await closeBrowserInstance();
    throw new Error(`Error Scraping Data: ${error.message}`);
  }
};

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

  await mongoose.connect("mongodb://localhost:27017/bull-test");
  const combos = createCombos(parameters);
  const combo = combos[0];
  const url = constructQuery(baseUrl, combo);
  const name = `${Object.entries(combo).map(([key, value]) => `${value}`).join('-')}`;
  const scrapingQueue = new Queue(name, { connection: { host: "localhost", port: 6379 } });
  const worker = new Worker(scrapingQueue.name, scrapingProcessor, { concurrency: 5, connection: { host: "localhost", port: 6379 } });

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
      const { maxResults, maxPages, queryParams } = await scout({ url, context: { useCase: "search" } });
      await crawlPages(scrapingQueue, { baseUrl, combo, maxPages, maxResults, queryParams });
      return res.json({ success: "ok" });
    } catch (error) {
      console.error("===x error:", error.message);
      return res.json({ error: `Error Creating Task Jobs: ${error.message} ` });
    }
  })
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