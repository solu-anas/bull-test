const {
  parameters,
  conf,
  baseUrl,
  getMaxResultsAndPages,
  getQueryParams,
  agreeOnConsent,
  removePopIns,
  getBrowserInstance,
  closeBrowserInstance,
  checkForTurnStile,
  detectTurnStile,
  handleConsent,
  handleTurnStile,
  handlePopIns,
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

const scout = async ({ url }) => {
  try {
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });
    await handleTurnStile(page, { useCase: "search" });
    await handleConsent(page);
    await handlePopIns(page);
    const { maxResults, maxPages } = await getMaxResultsAndPages(page);
    const queryParams = await getQueryParams(page);
    const fullUrl = await page.evaluate(() => window.location.href);
    // always close page after use
    await page.close();
    return { maxResults, maxPages, queryParams, fullUrl };
  } catch (error) {
    throw new Error(`Error Scouting Page: ${error.message}`);
  }
};

const crawlPages = async (scrapingQueue, { pageNumber = 1, baseUrl, combo, maxPages, maxResults, queryParams }) => {
  try {
    const { contexte } = queryParams;
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    console.log(`page: ${pageNumber} of ${maxPages}`);
    if (pageNumber <= maxPages) {
      const url = constructUrlWithParams(baseUrl, { ...combo, ...queryParams, page: pageNumber });
      const { queryParams: currentParams } = await scout({ url });
      if (currentParams.contexte && currentParams.contexte !== contexte) {
        queryParams.contexte = currentParams.contexte;
        console.log("===> contexte changed:", queryParams.contexte);
      }
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
      await page.goto(url, { waitUntil: 'networkidle2' });
      await handleTurnStile(page);
      await handleConsent(page);
      await handlePopIns(page);
      await page.screenshot({ path: `./screenshots/crawling/screenshot-page-${pageNumber}.png` });
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
    throw new Error(`Error Crawling Page: ${error.message}`);
  }
};

const scrapingProcessor = async (job) => {
  try {
    const { leadId, pjId } = job.data;
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    const url = `https://www.pagesjaunes.fr/pros/${pjId}`;
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 });
    await handleTurnStile(page, { useCase: "lead" });
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
          const day = element.querySelector('p.jour')?.innerText.trim() || "";
          const hours = element.querySelector('p.liste span.horaire')?.innerText.trim().split(" - ") || [];
          return { day, hours };
        })
      });

      legalInfo = await page.evaluate(() => {
        const establishmentInfo = {};
        const companyInfo = {};

        // Extract establishment data
        // eslint-disable-next-line no-undef
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
      console.warn("===> error:", error.message);
      job.log(`Error Scraping Data: ${error.message}`);
    }

    // update lead with data
    const scrapedData = { name, phone, address, website, brands, workingHours, legalInfo };
    const updates = {};
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
    }
    // always close page after use
    await page.close();
    return { success: `Scraped Data of Lead: ${pjId} Successfully` };
  } catch (error) {
    job.log(`Error Scraping Data: ${error.message}`);
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
      const { maxResults, maxPages, queryParams } = await scout({ url });
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