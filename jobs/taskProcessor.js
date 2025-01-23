const {
  constructQuery,
  scout,
  baseUrl,
  connectDB,
  constructUrlWithParams,
  handleContext,
  apiCredentials,
} = require("../helpers");
const { Queue, Worker } = require("bullmq");
const { Lead } = require("../models");
const path = require("path");
const cheerio = require("cheerio")

module.exports = async (job) => {
  try {
    await connectDB();
    // We are here
    let url;
    const { leadId, pjId, pageNumber, baseUrl, combo, maxPages, maxResults, queueName } = job.data;
    if (!maxPages) {
      throw new Error("maxPages is not defined");
    }

    let { queryParams } = job.data;
    console.log("===> scraping started ...");
    // const browser = await getBrowserInstance();
    // const page = await browser.newPage();
    if (pjId) {
      // url = constructUrl({ pjId });
      // Scrape a specific lead page
      const url = `https://www.pagesjaunes.fr/pros/${pjId}`;
      const proxyConf = {
        method: "POST",
        body: JSON.stringify({ url, "geo": "France" }),
        headers: {
          "Content-Type": "application/json",
          "Authorization": apiCredentials,
        },
      };
      const context = { useCase: "lead", job };
      const response = await fetch("https://scraper-api.smartproxy.com/v2/scrape", proxyConf);
      const page = (await response.json()).results[0].content;
      // await setUpPage(page, { url, context });
      // await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
      const scrapedData = await scrapePage(page);
      const updates = {};
      Object.entries(scrapedData).forEach(([key, value]) => {
        if (value) {
          updates[`data.${key}`] = value;
        }
      });
      if (Object.keys(updates).length !== 0) {
        const lead = await Lead.findByIdAndUpdate(leadId, updates, { new: true });
        if (!lead) {
          job.log(`Lead ${pjId} not found, creating new instance...`);
          const newLead = new Lead({ data: { pjId, ...updates } });
          await newLead.save();
        }
      }
    } else if (pageNumber) {
      // Crawl pages for leads
      console.log(`Processing page: ${pageNumber} of ${maxPages}`);
      url = constructUrlWithParams(baseUrl, { ...combo, ...queryParams, page: pageNumber });
      const context = { useCase: "search", job };
      // await setUpPage(page, { url, context });
      const proxyConf = {
        method: "POST",
        body: JSON.stringify({ url, "geo": "France" }),
        headers: {
          "Content-Type": "application/json",
          "Authorization": apiCredentials,
        },
      };

      const response = await fetch("https://scraper-api.smartproxy.com/v2/scrape", proxyConf);
      const page = (await response.json()).results[0].content;
      queryParams = await handleContext(url, queryParams, { context });
      const $ = cheerio.load(page);
      // await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
      // await handleConsent(page, { context, withDelay: false });
      // await handlePopIns(page, { context, withDelay: false });

      // const pjIds = await page.$$eval('#listResults ul li', (elements) =>
      //   elements.filter(({ id }) => !!id).map((element) => element?.id?.split("bi-")[1].trim())
      // );

      const pjIds = $('#listResults ul li')
        .filter((_, element) => !!$(element).attr('id'))
        .map((_, element) => $(element).attr('id').split("bi-")[1].trim())
        .toArray();


      // const queue = getQueue(combo);
      const queue = new Queue(queueName, { connection: { host: "localhost", port: 6379 } });
      const createLeadsForJob = pjIds.map((pjId) => {
        const lead = new Lead({ data: { pjId } });
        return Promise.all([
          // Save lead
          lead.save(),
          // Add scraping job for each ID
          queue.add(`scraping-of-${pjId}`, { leadId: lead._id.toHexString(), pjId: lead.data.pjId }),
        ]);
      });
      await Promise.all(createLeadsForJob);

      // Enqueue the next page if within bounds
      if (pageNumber < maxPages) {
        await queue.add("crawl-job", {
          pageNumber: pageNumber + 1,
          baseUrl,
          combo,
          maxPages,
          maxResults,
          queryParams,
        });
      }
    }

  } catch (error) {
    job.log(`Error Processing Job: ${error.message}`);
    console.error(error.stack);
    // await closeBrowserInstance();
    throw new Error(`Error Processing Job: ${error.message}`);
  }
};

// const taskProcessor = async (job) => {
//   try {
//     const { combo } = job.data;
//     const url = constructQuery(baseUrl, combo);

//     // scout
//     const context = { useCase: "search", job };
//     const { maxResults, maxPages, queryParams } = await scout({ url, context });

//     // create crawlingQueue
//     const queueName = `crawling-of-${Object.entries(combo).map(([key, value]) => `${value}`).join('-')}`;
//     const crawlingQueue = new Queue(queueName, { connection: { host: "localhost", port: 6379 } });
//     new Worker(crawlingQueue.name, path.join(__dirname, `./crawlingProcessor.js`), { connection: { host: "localhost", port: 6379 } });

//     // add first job to crawlingQueue (crawling first page)
//     await crawlingQueue.add(`crawling-of-page-1`, { pageNumber: 1, baseUrl, combo, maxPages, maxResults, queryParams, crawlingQueueName: crawlingQueue.name });

//     // job is done
//     return job.log(`Job ${job.id} done`);
//   } catch (error) {
//     job.log(`Error Processing Job: ${error.message}`);
//   }
// };

// module.exports = taskProcessor;