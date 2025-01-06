const fs = require("fs/promises");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  getMaxResultsAndPages: async (page) => {
    let attempts = 0;
    let maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
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
  },
  getQueryParams: async (page) => {
    let attempts = 0;
    let maxAttempts = 0;
    while (attempts < maxAttempts) {
      try {
        console.log("===> extracting query params...")
        try {
          await page.waitForSelector("a.link_pagination.next", { timeout: 3000 });
        } catch (error) {
          attempts++;
          console.warn(`\t===! extracting query params... retrying ${attempts}`);
          if (attempts === maxAttempts) {
            throw new Error("Next Pagination Link not found");
          }
        }

        // Extract query params
        console.log("\t===> query params extracted.");
        console.log("\t===> query params: processing...");
        const dataset = await page.$$eval("a.link_pagination.next", (elements) => {
          return elements.find(({ dataset }) => !!dataset)?.dataset?.pjlb;
        }, { timeout: 3000 });
        if (!dataset) {
          throw new Error("Next Pagination Link's Dataset not found");
        }
        const { url: encodedPath } = JSON.parse(dataset)
        const relativePath = Buffer.from(encodedPath, 'base64').toString('utf-8');
        const queryParams = {};
        const parts = relativePath.split('?');
        if (parts.length > 1) {
          const query = parts[1];
          const pairs = query.split('&');
          pairs.forEach((pair) => {
            const [key, value] = pair.split('=');
            if (key === "contexte") {
              console.log("found contexte:", value);
            }
            queryParams[key] = value;
          });
        }
        return queryParams;
      } catch (error) {
        throw new Error(`Error Extracting Query Params: ${error.message}`);
      };
    }
  },
  agreeOnConsent: async (page) => {
    try {
      console.log("===> agreeing on consent...");
      await page.waitForSelector("#didomi-notice-agree-button", { timeout: 3000 });
      await page.click("#didomi-notice-agree-button");
      console.log("\t===> consent agreed.");
      return page;
    } catch (error) {
      return page;
    }
  },
  removePopIns: async (page) => {
    try {
      console.log('===> removing pop-ins...');
      // Remove First "Pop-in"
      const selector1 = '#popin-en-savoir-plus';
      console.log('\t===> removing pop-in 1...');
      await page.evaluate((sel) => {
        // eslint-disable-next-line no-undef
        const element = document.querySelector(sel);
        if (element) {
          element.remove();
          console.log(`Element with selector "${sel}" removed.`);
        } else {
          console.log(`Element with selector "${sel}" not found.`);
        }
      }, selector1);
      console.log('\t===> pop-in 1 removed...');

      // Remove Second "Pop-in"
      const selector2 = '#popin-donnee-perso';
      console.log('\t===> removing pop-in 2...');
      await page.evaluate((sel) => {
        // eslint-disable-next-line no-undef
        const element = document.querySelector(sel);
        if (element) {
          element.remove();
          console.log(`Element with selector "${sel}" removed.`);
        } else {
          console.log(`Element with selector "${sel}" not found.`);
        }
      }, selector2);
      console.log('\t===> pop-in 2 removed...');
      // Return the modified page
      return page;
    } catch (error) {
      console.warn('===! Pop-in not found or could not be closed:', error.message);
      return page;
    }
  },
  checkForTurnStile: async (page, useCase) => {
    let attempts = 0;
    const maxAttempts = 3;
    const map = {
      "search": "#listResults",
      "lead": "#teaser-header",
    }
    while (attempts < maxAttempts) {
      try {
        // delay - wait for "puppeteer-real-browser" do its thing
        await ((ms) => new Promise(resolve => setTimeout(resolve, ms)))(5000);
        await page.waitForSelector(map[useCase], { timeout: 5000 });
        console.log('===> turnstile challenge passed.');
        break;
      } catch (error) {
        await page.screenshot({ path: `./screenshots/turnstile/attempt-${attempts}.png` })
        attempts++;
        console.log(`===> turnstile challenge: retrying... ${attempts}`);
        if (attempts === maxAttempts) {
          console.error('===! turnstile challenge failed.');
          throw new Error(`Turnstile Challenge Failed`);
        }
      }
    }
  },
  detectTurnStile: async (page) => {
    try {
      const hasTurnStile = await page.$$eval("p.h2", (elements) => {
        return elements[0]?.innerText?.includes("Verifying you are human") || false;
      })
      return hasTurnStile;
    } catch {
      return false;
    }
  },

  handleConsent: async (page, { delayTime = 5000 }) => {
    // add delay here if needed
    await delay(delayTime);
    // detect
    const selector = "#didomi-notice-agree-button";
    let detected;
    try {
      await page.waitForSelector(selector, { timeout: 0 });
      detected = true;
      console.log("===> consent button detected... proceeding");
    } catch (error) {
      detected = false;
    }
    // click
    if (detected) {
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          await page.click(selector);
        } catch (error) {
          attempts++;
          if (attempts === maxAttempts) {
            throw new Error(`Handling Consent Failed: ${error.message}`);
          }
        }
      }
    } else {
      console.log("===> consent button not detected... skipping")
    }
    return { success: "Consent Handled" };
  },
  handlePopIns: async (page, { delayTime = 5000 }) => {
    // add delay if needed
    await delay(delayTime);

    // detect
    const selectors = ["#popin-en-savoir-plus", "#popin-donnee-perso"];
    let detected;
    try {
      await Promise.allSettled(selectors.map((selector) => page.waitForSelector(selector, { timeout: 0 })));
      detected = true;
      console.log("===> popings detect ...proceeding");
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
      console.log("===> popings not detected ...skipping");
    }
    return { success: "PopIngs Handled" };
  },
  handleTurnStile: async (page, { useCase = "search", delayTime = 5000 }) => {
    // // add delay if needed
    // await delay(delayTime);

    // detect
    let hasTurnStile;
    try {
      hasTurnStile = await page.$$eval("p.h2", (elements) => {
        return elements[0]?.innerText?.includes("Verifying you are human") || false;
      }, { timeout: 0 });
    } catch (error) {
      hasTurnStile = false;
    }
    if (hasTurnStile) {
      console.log("===> turnstile challenge detected ...proceeding");
      // check if puppeteer-real-browser handled the turnstile challenge
      let attempts = 0;
      const maxAttempts = 3;
      const map = {
        "search": "#listResults",
        "lead": "#teaser-header",
      }
      while (attempts < maxAttempts) {
        try {
          // delay - wait for "puppeteer-real-browser" do its thing
          await delay(delayTime);
          await page.waitForSelector(map[useCase], { timeout: delayTime });
          console.log('===> turnstile challenge passed.');
          break;
        } catch (error) {
          await page.screenshot({ path: `./screenshots/turnstile/attempt-${attempts}.png` })
          attempts++;
          console.log(`===> turnstile challenge: retrying... ${attempts}`);
          if (attempts === maxAttempts) {
            console.error('===! turnstile challenge failed.');
            throw new Error(`Handling Turnstile Challenge Failed`);
          }
        }
      }
    } else {
      console.log("===> turnstile challenge not detected ...skipping");
    }
    return { success: "TurnStile Challenge Handled" };
  }
}