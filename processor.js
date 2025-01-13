const {
  setUpPage,
  handleTurnStile,
  handleConsent,
  handlePopIns,
  handleContext,
  getBrowserInstance,
  closeBrowserInstance,
  scrapePage,
  constructUrlWithParams,
  getQueue,
  createCluster,
} = require("./helpers");

const { Lead } = require("./models");

module.exports = async (job) => {
  try {
    // await mongoose.connect("mongodb://localhost:27017/bull-test");
    await connectDB();
    console.log("here");
    console.log(cluster);
    // We are here
    const cluster = await createCluster();
    await cluster.task(async ({ page, data }) => {
      const { leadId, pjId, pageNumber, baseUrl, combo, maxPages, maxResults } = job.data;
      let { queryParams } = job.data;
      const browser = await getBrowserInstance();
      const page = await browser.newPage();

      if (pjId) {
        // Scrape a specific lead page
        const url = `https://www.pagesjaunes.fr/pros/${pjId}`;
        const context = { useCase: "lead", job };
        await setUpPage(page, { url, context });
        await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
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
        const url = constructUrlWithParams(baseUrl, { ...combo, ...queryParams, page: pageNumber });
        const context = { useCase: "search", job };
        await setUpPage(page, { url, context });
        queryParams = await handleContext(url, queryParams, { context });
        await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
        await handleConsent(page, { context, withDelay: false });
        await handlePopIns(page, { context, withDelay: false });

        const pjIds = await page.$$eval('#listResults ul li', (elements) =>
          elements.filter(({ id }) => !!id).map((element) => element?.id?.split("bi-")[1].trim())
        );

        const queue = getQueue(combo);
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
    })
    // Add initial job to the cluster
    cluster.queue(job.data);

    // Close the cluster
    await cluster.idle();
    await cluster.close();

    // // Always close the page after use
    // await page.close();
    // return { success: pjId ? `Scraped Data of Lead: ${pjId} Successfully` : `Processed page ${pageNumber} successfully` };
  } catch (error) {
    job.log(`Error Processing Job: ${error.message}`);
    console.error(error.stack);
    await closeBrowserInstance();
    throw new Error(`Error Processing Job: ${error.message}`);
  }
};

// module.exports = async (job) => {
//   try {
//     await mongoose.connect("mongodb://localhost:27017/bull-test")
//     const { leadId, pjId } = job.data;
//     const browser = await getBrowserInstance();
//     const page = await browser.newPage();
//     const url = `https://www.pagesjaunes.fr/pros/${pjId}`;
//     const context = { useCase: "lead", job };
//     await setUpPage(page, { url, context });
//     await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
//     const scrapedData = await scrapePage(page);
//     const updates = {};
//     // TOREVISE: do more calculations, make the job return a report of what it collected
//     Object.entries(scrapedData).forEach(([key, value]) => {
//       if (value) {
//         updates[`data.${key}`] = value;
//       }
//     });
//     if (Object.keys(updates).length !== 0) {
//       const lead = await Lead.findByIdAndUpdate(leadId, updates, { new: true });
//       if (!lead) {
//         job.log(`lead ${pjId} not found, creating new instance...`);
//         const newLead = new Lead({ data: { pjId, ...updates } });
//         await newLead.save();
//       }
//     };
//     // always close page after use
//     await page.close();
//     return { success: `Scraped Data of Lead: ${pjId} Successfully` };
//   } catch (error) {
//     job.log(`Error Scraping Data: ${error.message}`);
//     await closeBrowserInstance();
//     throw new Error(`Error Scraping Data: ${error.message}`);
//   }
// };