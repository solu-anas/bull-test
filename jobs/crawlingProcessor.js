const {
  constructUrlWithParams,
  handleContext,
  connectDB,
  apiCredentials,
} = require("../helpers");

const { Queue, Worker } = require("bullmq");
const { Lead } = require("../models");

let queueName;
module.exports = async (job) => {
  try {
    await connectDB();
    const { pageNumber, combo, queryParams, crawlingQueueName, maxPages } = job.data;
    // really?
    queueName = crawlingQueueName;

    const url = constructUrlWithParams(baseUrl, { ...combo, ...queryParams, page: pageNumber });
    const context = { useCase: "search", job };
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

    // extract pjIds
    const pjIds = $('#listResults ul li')
      .filter((_, element) => !!$(element).attr('id'))
      .map((_, element) => $(element).attr('id').split("bi-")[1].trim())
      .toArray();

    // create scraping queue
    const scrapingQueue = new Queue(`scraping-of-${combo}-page-${pageNumber}`, { connection: { host: "localhost", port: 6379 } });
    new Worker(scrapingQueue.name, path.join(__dirname, "./scrapingProcessor.js"), { concurrency: 2, connection: { host: "localhost", port: 6379 } });

    // add to scraping queue
    await scrapingQueue.addBulk(pjIds.map((pjId) => {
      const lead = await(new Lead({ data: { pjId } })).save();
      return { name: `scraping-of-${pjId}`, data: { pjId, leadId: lead._id.toString() } };
    }));

    if (pageNumber < maxPages) {
      const crawlingQueue = new Queue(crawlingQueueName, { connection: { host: "localhost", port: 6379 } });
      await crawlingQueue.add(`crawling-of-page-${pageNumber + 1}`, {
        pageNumber: pageNumber + 1,
        combo,
        maxPages,
        queryParams,
      });
    }
  } catch (error) {
    throw new Error(`Error Processing Job: ${error.message}`);
  }
};

module.exports.queueName = queueName;