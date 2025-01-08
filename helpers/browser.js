const Xvfb = require('xvfb');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { connect } = require("puppeteer-real-browser");
const xvfb = new Xvfb();

const conf = {
  puppeteer,
  headless: true,
  args: [],
  customConfig: {},
  turnstile: true,
  connectOption: {},
  disableXvfb: false,
  ignoreAllFlags: false,
};
const initBrowser = async (conf) => {
  try {
    // xvfb.startSync();
    const { browser } = await connect(conf);
    const page = await browser.newPage();
    return { browser, page };
  } catch (error) {
    throw new Error(`Error Initiating Browser: ${error.message}`);
  }
};

let browserInstance = null;
const getBrowserInstance = async () => {
  try {
    const conf = {
      puppeteer,
      headless: true,
      args: [],
      customConfig: {},
      turnstile: true,
      connectOption: {},
      disableXvfb: true,
      ignoreAllFlags: false,
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

module.exports = { closeBrowserInstance, getBrowserInstance, initBrowser, conf };