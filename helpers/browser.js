const { Cluster } = require("puppeteer-cluster");
// const { connect } = require("puppeteer-real-browser");
const puppeteer = require("puppeteer-real-browser");
const { connect } = puppeteer;
const path = require("path");
const os = require("os");
const maxConcurrency = Math.min(os.cpus().length, 10);

let browserInstance;
const getBrowserInstance = async () => {
  try {
    const conf = {
      // puppeteer,
      headless: true,
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
    // concurrency: Cluster.CONCURRENCY_CONTEXT,
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency,
    monitor: true,
    // puppeteer: browser,
    // puppeteer,
    // puppeteerOptions: {
    //   // puppeteer,
    //   headless: false,
    //   args: [],
    //   customConfig: {},
    //   turnstile: true,
    //   connectOption: {},
    //   disableXvfb: true,
    //   ignoreAllFlags: false,
    //   fingerprint: true,
    //   tls: true,
    //   userDataDir: path.join(__dirname, "../user_data"),
    //   plugins: [
    //     require('puppeteer-extra-plugin-stealth')()
    //   ]
    // },
  });

  return cluster;
};

module.exports = { closeBrowserInstance, getBrowserInstance, createCluster };