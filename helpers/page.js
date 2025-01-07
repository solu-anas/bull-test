const { getBrowserInstance } = require("./browser");
const path = require("path");

// localy-used too
const setUpPage = async (page, { context, url, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' }) => {
  const logMessage = (useCase, message) => {
    const map = {
      "search": console.log(message),
      "lead": context?.job?.log(message),
    }
    return map[useCase];
  };
  // start here
  logMessage(context.useCase, "===> setting up page ...");
  let attempts = 0;
  let maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      await page.setUserAgent(userAgent);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });
      logMessage(context.useCase, "===> page set up ...done");
      break;
    } catch (error) {
      attempts++;
      logMessage(context.useCase, `===> setting up page: retrying ...${attempts}`);
      if (attempts === maxAttempts) {
        throw new Error(`Error Setting Up Page: ${error.message}`);
      }
    }
  }
  // await page.screenshot({ path: path.join(__dirname, "../screenshots/page_setup.png") });
  return { success: "Page Set Up Successfully" };
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getQueryParams = async (page, { context, withDelay = false, delayTime = 5000 }) => {
  const logMessage = (useCase, message) => {
    const map = {
      "search": console.log(message),
      "lead": context?.job?.log(message),
    }
    return map[useCase];
  };

  logMessage(context.useCase, "===> extracting query params...");
  if (withDelay) {
    await delay(delayTime);
  }

  const queryParams = {};
  try {
    await page.waitForSelector("a.link_pagination.next", { timeout: 3000 });
  } catch (error) {
    throw new Error("Next Pagination Link not found");
  }
  logMessage(context.useCase, "\t===> query params extracted.");

  try {
    // Extract query params
    logMessage(context.useCase, "\t===> query params: processing...");
    const dataset = await page.$$eval("a.link_pagination.next", (elements) => {
      return elements.find(({ dataset }) => !!dataset)?.dataset?.pjlb;
    }, { timeout: 0 });
    if (!dataset) {
      throw new Error("Next Pagination Link's Dataset not found");
    }
    let parsedDataset;
    try {
      parsedDataset = JSON.parse(dataset)
    } catch (error) {
      throw new Error(`Error Parsing Dataset: ${error.message}`);
    }
    const { url: encodedPath } = parsedDataset;
    const relativePath = Buffer.from(encodedPath, 'base64').toString('utf-8');
    const parts = relativePath.split('?');
    if (parts.length > 1) {
      const query = parts[1];
      const pairs = query.split('&');
      pairs.forEach((pair) => {
        const [key, value] = pair.split('=');
        queryParams[key] = value;
      });
      return queryParams;
    } else {
      throw new Error(`No Query Params were found`);
    }
  } catch (error) {
    throw new Error(`Error Extracting Query Params: ${error.message}`);
  }
};

const getMaxResultsAndPages = async (page, { withDelay = false, delayTime = 5000 }) => {
  let attempts = 0;
  let maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      if (withDelay) {
        await delay(delayTime);
      }
      // Extract max results and pages
      console.log("===> extracting max results and pages...");
      const maxResultsSelector = "#SEL-nbresultat";
      const maxPagesSelector = '#SEL-compteur.pagination-compteur';
      const maxResults = await page.$eval(maxResultsSelector, (el) => parseInt(el.innerText.split(" ").join("")));
      const maxPages = await page.$eval(maxPagesSelector, (el) => {
        const parts = el.innerText.split('/');
        return parseInt(parts[1].trim());
      });
      console.log("\t===> max results and pages extracted.");
      return { maxResults, maxPages };
    } catch (error) {
      await page.screenshot({ path: `./screenshots/maxResults/attempt-${attempts}.png` })
      attempts++;
      console.log(`\t===> extracting max results and pages: retrying... ${attempts}`);
      if (attempts === maxAttempts) {
        console.error('\t===! extracting max results and pages: failed.');
        // return { maxResults: 0, maxPages: 0 };

        throw new Error(`Error extracting max results and pages: ${error.message}`);
      }
    }
  }
};

const scout = async ({ url, context }) => {
  try {
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    await setUpPage(page, { url, context });
    await handleTurnStile(page, { context, useCase: "search", withDelay: true, delayTime: 10000 });
    await handleConsent(page, { context, withDelay: false, delayTime: 5000 });
    await handlePopIns(page, { context, withDelay: false, delayTime: 5000 });
    const { maxResults, maxPages } = await getMaxResultsAndPages(page, { withDelay: true, delayTime: 5000 });
    const queryParams = await getQueryParams(page, { context, withDelay: false });
    const fullUrl = await page.evaluate(() => window.location.href);

    // always close page after use
    await page.close();

    return { maxResults, maxPages, queryParams, fullUrl };
  } catch (error) {
    console.log(error.stack);
    throw new Error(`Error Scouting Page: ${error.message}`);
  }
};

const handleContext = async (url, oldParams, { context }) => {
  try {
    const logMessage = (useCase, message) => {
      const map = {
        "search": console.log(message),
        "lead": context?.job?.log(message),
      }
      return map[useCase];
    };

    logMessage(context.useCase, "===> Handling Page Context ...");
    // TOREVISE: do we really need to create another page for scouting?
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    await setUpPage(page, { context, url });
    await handleTurnStile(page, { context, useCase: "search", withDelay: true, delayTime: 5000 });
    await handleConsent(page, { context, withDelay: false, delayTime: 5000 });
    await handlePopIns(page, { context, withDelay: false, delayTime: 5000 });
    let newParams;
    try {
      newParams = await getQueryParams(page, { context, withDelay: true, delayTime: 5000 });
    } catch (error) {
      throw new Error(`Error Extracting Query Params: ${error.message}`);
    }
    const isChanged = (newParams?.contexte) && (newParams?.contexte !== oldParams?.contexte);
    if (isChanged) {
      logMessage(context.useCase, '===> Page Context Changed ... proceeding');
      oldParams["contexte"] = newParams.contexte;
      logMessage(context.useCase, '===> Page Context Changed: Context Mutated for Next Page');
      // return { queryParams: newParams };
      // done
      await page.close();
      return newParams;
    } else {
      logMessage(context.useCase, "===> Page Context Not Changed ... skipping");
      // return { queryParams: oldParams };
      // done
      await page.close();
      return oldParams;
    }
  } catch (error) {
    throw new Error(`Error Handling Page's Context: ${error.message}`);
  }
};

const handleTurnStile = async (page, { context, withDelay = false, delayTime = 5000 }) => {
  const map = {
    "search": "#listResults",
    "lead": "#teaser-header",
  };
  const logMessage = (useCase, message) => {
    const map = {
      "search": console.log(message),
      "lead": context?.job?.log(message),
    }
    return map[useCase];
  };

  // detect
  let hasTurnStile;

  // TOREMOVE
  await page.screenshot({ path: path.join(__dirname, "../screenshots/has-turnstile.png"), timeout: 5000 });

  try {
    hasTurnStile = await page.$$eval("p.h2", (elements) => {
      return elements[0]?.innerText?.toLowerCase().includes("Verifying you are human") || elements[0]?.innerText?.toLowerCase().includes("Verify you are human");
    }, { timeout: 1000 });
  } catch (error) {
    hasTurnStile = false;
  }

  // check if puppeteer-real-browser handled the turnstile challenge
  // add delay to let puppeteer-real-browser do its things
  if (withDelay) {
    await delay(delayTime);
  }

  if (hasTurnStile) {
    logMessage(context.useCase, "===> turnstile challenge detected ...proceeding");
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        await page.waitForSelector(map[useCase], { timeout: 1000 });
        logMessage(context.useCase, '===> turnstile challenge passed.');
        break;
      } catch (error) {
        attempts++;
        logMessage(useCase, `===> turnstile challenge: retrying... ${attempts}`);
        if (attempts === maxAttempts) {
          logMessage(context.useCase, '===! turnstile challenge failed.');
          throw new Error(`Handling Turnstile Challenge Failed`);
        }
      }
    }
  } else {
    console.log("===> turnstile challenge not detected ...skipping");
  }
  return { success: "TurnStile Challenge Handled" };
};

const handlePopIns = async (page, { context, withDelay = false, delayTime = 5000 }) => {
  // add delay if needed
  if (withDelay) {
    await delay(delayTime);
  }

  const logMessage = (useCase, message) => {
    const map = {
      "search": console.log(message),
      "lead": context?.job?.log(message),
    }
    return map[useCase];
  };

  // detect
  const selectors = ["#popin-en-savoir-plus", "#popin-donnee-perso"];
  let detected;
  try {
    await Promise.allSettled(selectors.map((selector) => page.waitForSelector(selector, { timeout: 100 })));
    detected = true;
    logMessage(context.useCase, "===> popins detected ...proceeding");
  } catch (error) {
    detected = false;
  }
  if (detected) {
    // remove
    for (let selector of selectors) {
      await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
          element.remove();
        }
      }, selector);
    }
  } else {
    logMessage(context.useCase, "===> popins not detected ...skipping");
  }
  return { success: "PopIns Handled" };
};

const handleConsent = async (page, { context, withDelay = false, delayTime = 5000 }) => {
  // add delay here if needed
  if (withDelay) {
    await delay(delayTime);
  }

  const logMessage = (useCase, message) => {
    const map = {
      "search": console.log(message),
      "lead": context?.job?.log(message),
    }
    return map[useCase];
  };

  // detect
  const selector = "#didomi-notice-agree-button";
  let detected;
  try {
    await page.waitForSelector(selector, { timeout: 100 });
    detected = true;
    logMessage(context.useCase, "===> consent button detected... proceeding");
  } catch (error) {
    detected = false;
  }

  // click
  if (detected) {
    await page.click(selector, { timeout: 100 });
  } else {
    logMessage(context.useCase, "===> consent button not detected... skipping");
  }
  return { success: "Consent Handled" };
};

module.exports = {
  handleContext,
  handleTurnStile,
  handlePopIns,
  handleConsent,
  getQueryParams,
  getMaxResultsAndPages,
  setUpPage,
  scout,
  delay,
};