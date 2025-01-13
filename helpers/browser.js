const { Cluster } = require("puppeteer-cluster");
const { connect } = require("puppeteer-real-browser");
const path = require("path");

let browserInstance;
const getBrowserInstance = async () => {
  try {
    const conf = {
      // puppeteer,
      headless: false,
      args: [],
      customConfig: {},
      turnstile: true,
      connectOption: {},
      disableXvfb: true,
      ignoreAllFlags: false,
      fingerprint: true,
      tls: true,
      userDataDir: path.join(__dirname, "../user_data"),
      plugins: [
        require('puppeteer-extra-plugin-stealth')()
      ]
    };
    if (!browserInstance) {
      const { browser } = await connect(conf);
      browserInstance = browser;
    }
    return browserInstance;
  } catch (error) {
    throw new Error(`Error Initiating Browser: ${error.message}`);
  }
};

const closeBrowserInstance = async () => {
  try {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
      // xvfb.stopSync();
    }
  } catch (error) {
    throw new Error(`Error Closing Browser: ${error.message}`);
  }
};

// Cluster initialization
const createCluster = async () => {
  const browser = await getBrowserInstance();

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 5,
    monitor: true,
    puppeteer: browser,
    puppeteerOptions: {},
  });

  return cluster;
};

module.exports = { closeBrowserInstance, getBrowserInstance, createCluster };