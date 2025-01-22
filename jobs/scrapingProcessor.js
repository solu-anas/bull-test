const { scrapePage, connectDB } = require("../helpers");
const { Lead } = require("../models");

module.exports = async (job) => {
  try {
    await connectDB();
    const { pjId, leadId } = job.data;
    if (!pjId) {
      throw new Error("No pjId Received");
    }
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
    };
  } catch (error) {
    job.log(`Error Processing Job: ${error.message}`);
  }
};