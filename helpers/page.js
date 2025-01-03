module.exports = {
  getMaxResultsAndPages: async (page) => {
    try {
      await page.screenshot({ path: "./screenshots/screenshot-max-results-and-pages.png" });
      // Extract max results and pages
      const maxResultsSelector = "#SEL-nbresultat";
      const maxPagesSelector = '#SEL-compteur.pagination-compteur';
      const maxResults = await page.$eval(maxResultsSelector, (el) => parseInt(el.innerText.split(" ").join("")));
      const maxPages = await page.$eval(maxPagesSelector, (el) => {
        const parts = el.innerText.split('/');
        return parseInt(parts[1].trim());
      });
      return { maxResults, maxPages };
    } catch (error) {
      console.warn("===! error extracting max results and pages:", error.message);
      return { maxResults: 0, maxPages: 0 };
    }
  },
  getQueryParams: async (page) => {
    try {
      // await ((ms) => new Promise(resolve => setTimeout(resolve, ms)))(5000);
      await page.screenshot({ path: "./screenshots/screenshot-query-params.png" });
      let attempts = 0;
      let maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          await page.waitForSelector("a.link_pagination.next", { timeout: 3000 });
        } catch (error) {
          attempts++
          console.log(`===> Query Params: retrying... ${attempts}`);
          if (attempts === maxAttempts) {
            throw new Error("Next Pagination Link not found");
          }
        }

      }
      // Extract query params
      const dataset = await page.$$eval("a.link_pagination.next", (elements) => {
        return elements.find(({ dataset }) => !!dataset)?.dataset?.pjlb;
      }, { timeout: 5000 });
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
  },
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  agreeOnConsent: async (page) => {
    try {
      console.log("===> agreeing on consent...");
      await page.waitForSelector("#didomi-notice-agree-button", { timeout: 3000 });
      await page.click("#didomi-notice-agree-button");
      console.log("===> consent agreed.");
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
        await page.waitForSelector(map[useCase], { timeout: 5000 });
        console.log('===> turnstile challenge passed.');
        break;
      } catch {
        attempts++;
        console.log(`===> turnstile challenge: retrying... ${attempts}`);
        if (attempts === maxAttempts) {
          console.error('===! turnstile challenge failed.');
          process.exit(0);
        }
      }
    }
  },
}