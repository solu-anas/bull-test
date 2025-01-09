const { setUpPage, handleTurnStile, getBrowserInstance, closeBrowserInstance, scrapePage } = require("./helpers");
const { Lead } = require("./models");
const mongoose = require("mongoose");



module.exports = async (job) => {
  try {
    await mongoose.connect("mongodb://localhost:27017/bull-test")
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