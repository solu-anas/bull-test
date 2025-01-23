const { getBrowserInstance, closeBrowserInstance } = require("./browser");
const { apiCredentials } = require("./env");
const cheerio = require("cheerio");
const { Lead } = require("../models");

// localy-used too
const setUpPage = async (page, { context, url, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' }) => {
  let cookies;
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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
      // retrieve any cookies to have a persistent session
      cookies = await page.cookies();
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
  return { cookies };
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
  // if (withDelay) {
  //   await delay(delayTime);
  // }


  // try {
  //   await page.waitForSelector("a.link_pagination.next", { timeout: 3000 });
  // } catch (error) {
  //   throw new Error("Next Pagination Link not found");
  // }
  // logMessage(context.useCase, "\t===> query params extracted.");

  // try {
  //   // Extract query params
  //   logMessage(context.useCase, "\t===> query params: processing...");
  //   const dataset = await page.$$eval("a.link_pagination.next", (elements) => {
  //     return elements.find(({ dataset }) => !!dataset)?.dataset?.pjlb;
  //   }, { timeout: 0 });
  //   if (!dataset) {
  //     throw new Error("Next Pagination Link's Dataset not found");
  //   }
  //   let parsedDataset;
  //   try {
  //     parsedDataset = JSON.parse(dataset)
  //   } catch (error) {
  //     throw new Error(`Error Parsing Dataset: ${error.message}`);
  //   }
  //   const { url: encodedPath } = parsedDataset;
  //   const relativePath = Buffer.from(encodedPath, 'base64').toString('utf-8');
  //   const parts = relativePath.split('?');
  //   if (parts.length > 1) {
  //     const query = parts[1];
  //     const pairs = query.split('&');
  //     pairs.forEach((pair) => {
  //       const [key, value] = pair.split('=');
  //       queryParams[key] = value;
  //     });
  //     return queryParams;
  //   } else {
  //     throw new Error(`No Query Params were found`);
  //   }
  // } catch (error) {
  //   throw new Error(`Error Extracting Query Params: ${error.message}`);
  // }
  const queryParams = {};
  try {
    // Load HTML into Cheerio
    const $ = cheerio.load(page);

    // Extract query params
    logMessage(context.useCase, "\t===> query params: processing...");

    // Find the first element with the 'next' class and extract its dataset.pjlb
    const dataset = $("a.link_pagination.next")
      .map((_, element) => $(element).data('pjlb'))
      .toArray()
      .find((data) => !!data);

    if (!dataset) {
      throw new Error("Next Pagination Link's Dataset not found");
    }

    // let parsedDataset;
    // try {
    //   parsedDataset = JSON.parse(dataset);
    // } catch (error) {
    //   throw new Error(`Error Parsing Dataset: ${error.message}`);
    // }

    const { url: encodedPath } = dataset;
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
      throw new Error("No Query Params were found");
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
      // if (withDelay) {
      //   await delay(delayTime);
      // }
      // Extract max results and pages
      console.log("===> max results and pages...");
      const maxResultsSelector = "#SEL-nbresultat";
      const maxPagesSelector = '#SEL-compteur.pagination-compteur';
      const $ = cheerio.load(page);
      const maxResults = parseInt(
        $(maxResultsSelector).text().split(" ").join("")
      );
      const maxPages = parseInt(
        $(maxPagesSelector).text().split('/')[1].trim()
      );
      // old
      // const maxResults = await page.$eval(maxResultsSelector, (el) => parseInt(el.innerText.split(" ").join("")));
      // const maxPages = await page.$eval(maxPagesSelector, (el) => {
      //   const parts = el.innerText.split('/');
      //   return parseInt(parts[1].trim());
      // });
      console.log("\t===> max results and pages extracted.");
      return { maxResults, maxPages };
    } catch (error) {

      // TOREMOVE
      // await page.screenshot({ path: `./screenshots/maxResults/attempt-${attempts}.png` })

      attempts++;
      console.log(`\t===> max results and pages: retrying... ${attempts}`);
      if (attempts === maxAttempts) {
        console.error('\t===! max results and pages: failed.');
        // return { maxResults: 0, maxPages: 0 };

        throw new Error(`Error extracting max results and pages: ${error.message}`);
      }
    }
  }
};

// const scout = async ({ url, context }) => {
//   const proxyConf = {
//     method: "POST",
//     body: JSON.stringify({ url, "geo": "France" }),
//     headers: {
//       "Content-Type": "application/json",
//       "Authorization": apiCredentials,
//     },
//   };

//   let attempts = 0;
//   let maxAttempts = 3;
//   while (attempts < maxAttempts) {
//     try {
//       let response;
//       try {
//         response = await fetch("https://scraper-api.smartproxy.com/v2/scrape", proxyConf);
//       } catch (error) {
//         throw new Error(`Error fetching page: ${error.message}`);
//       }

//       if (!response.ok) {
//         throw new Error(`Error fetching page: ${response.statusText}`);
//       };

//       const page = (await response.json()).results[0].content;
//       // old
//       // const browser = await getBrowserInstance();
//       // const page = await browser.newPage();
//       // await setUpPage(page, { url, context });
//       // await handleTurnStile(page, { context, withDelay: true, delayTime: 10000 });
//       // await handleConsent(page, { context, withDelay: false, delayTime: 5000 });
//       // await handlePopIns(page, { context, withDelay: false, delayTime: 5000 });
//       const { maxResults, maxPages } = await getMaxResultsAndPages(page, { withDelay: true, delayTime: 5000 });
//       const queryParams = await getQueryParams(page, { context, withDelay: false, delayTime: 5000 });
//       // const fullUrl = await page.evaluate(() => window.location.href);
//       return { maxResults, maxPages, queryParams }
//     } catch (error) {
//       attempts++;
//       console.log(`===> scout: retrying... ${attempts}`);
//       if (attempts === maxAttempts) {
//         console.error('\t===! scout: failed.');
//         throw new Error(`Error Scouting: ${error.message}`);
//       }
//     }
//     //   const browser = await getBrowserInstance();
//     //   const page = await browser.newPage();
//     //   // const context = { useCase: "search" }
//     //   await setUpPage(page, { url, context });
//     //   await handleTurnStile(page, { context, withDelay: true, delayTime: 10000 });
//     //   await handleConsent(page, { context, withDelay: false, delayTime: 5000 });
//     //   await handlePopIns(page, { context, withDelay: false, delayTime: 5000 });
//     //   const { maxResults, maxPages } = await getMaxResultsAndPages(page, { withDelay: true, delayTime: 5000 });
//     //   const queryParams = await getQueryParams(page, { context, withDelay: false });
//     //   const fullUrl = await page.evaluate(() => window.location.href);

//     //   // always close page after use
//     //   await page.close();

//     //   return { maxResults, maxPages, queryParams, fullUrl };
//     // } catch (error) {
//     //   console.log(error.stack);
//     //   throw new Error(`Error Scouting Page: ${error.message}`);
//     // }
//   };
// };


const scout = async ({ url, context }) => {
  const proxyConf = {
    method: "POST",
    body: JSON.stringify({ url, "geo": "France" }),
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiCredentials,
    },
  };

  let attempts = 0;
  let maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      // Add exponential backoff delay
      const backoffDelay = Math.pow(2, attempts) * 1000;
      await delay(backoffDelay);

      const response = await fetch("https://scraper-api.smartproxy.com/v2/scrape", proxyConf);

      console.log(await response.json());

      if (response.status === 429) { // Too Many Requests
        attempts++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Error fetching page: ${response.statusText}`);
      }

      const page = (await response.json()).results[0].content;
      const { maxResults, maxPages } = await getMaxResultsAndPages(page, { withDelay: true, delayTime: 5000 });
      const queryParams = await getQueryParams(page, { context, withDelay: false, delayTime: 5000 });

      return { maxResults, maxPages, queryParams };
    } catch (error) {
      attempts++;
      console.log(`===> scout: retrying... ${attempts}`);
      if (attempts === maxAttempts) {
        console.error('\t===! scout: failed.');
        throw new Error(`Error Scouting: ${error.message}`);
      }
    }
  }
};

const handleContext = async (url, oldParams, { context }) => {
  let attempts = 0;
  let maxAttempts = 3;
  while (attempts < maxAttempts) {
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
      // const browser = await getBrowserInstance();
      // const page = await browser.newPage();
      // await setUpPage(page, { context, url });
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
      // await handleTurnStile(page, { context, useCase: "search", withDelay: true, delayTime: 5000 });
      // await handleConsent(page, { context, withDelay: false, delayTime: 5000 });
      // await handlePopIns(page, { context, withDelay: false, delayTime: 5000 });
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
        // await page.close();
        return newParams;
      } else {
        logMessage(context.useCase, "===> Page Context Not Changed ... skipping");
        // return { queryParams: oldParams };
        // done
        // await page.close();
        return oldParams;
      }
    } catch (error) {
      attempts++;
      console.log(`===> handleContext: retrying... ${attempts}`);
      if (attempts === maxAttempts) {
        console.error('\t===! handleContext: failed.');
        throw new Error(`Error Handling Page's Context: ${error.message}`);
      }
    }
  }
};

const handleTurnStile = async (page, { context, withDelay = false, delayTime = 5000 }) => {
  const logMessage = (useCase, message) => {
    const map = {
      "search": console.log(message),
      "lead": context?.job?.log(message),
    }
    return map[useCase];
  };

  const selectorMap = {
    search: "#listResults",
    lead: "#teaser-header",
  };

  const useCase = context?.useCase;
  const targetSelector = selectorMap[useCase];
  if (!targetSelector) throw new Error("Invalid use case provided.");

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      // Check for the presence of the Turnstile checkbox
      await delay(5000);
      await page.waitForSelector('.cb-lb input[type="checkbox"]', { timeout: 5000 });
      await page.click('.cb-lb input[type="checkbox"]');
      logMessage(useCase, "===> Turnstile checkbox clicked.");
    } catch (error) {
      // If the checkbox is not found, check for the actual page
      try {
        await delay(5000);
        await page.waitForSelector(targetSelector, { timeout: 5000 });
        logMessage(useCase, "===> Turnstile Challenge Passed.");
        return { success: "Turnstile Challenge Passed" };
      } catch (innerError) {
        // Log retry and reattempt if actual page is not displayed
        // await page.screenshot({ path: path.join(__dirname, `../screenshots/turnstile/${useCase}-${attempts}.png`) })
        attempts++;
        logMessage(useCase, `\t===> Attempt ${attempts} failed. Retrying... (${innerError.message})`);
        if (attempts === maxAttempts) {
          throw new Error(`Turnstile Challenge Did Not Pass: ${innerError.message}`);
        }
        // if (withDelay) await delay(5000);
      }
    }
  }

  throw new Error("Turnstile Challenge Could Not Be Completed.");
};

const handlePopIns = async (page, { context, withDelay = false, delayTime = 5000 }) => {
  // add delay if needed
  // if (withDelay) {
  //   await delay(delayTime);
  // }

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

// const scrapePage = async (page) => {
//   // await page.setRequestInterception(true);
//   // page.on("request", (req) => {
//   //   const blockResources = ["image", "stylesheet", "font"];
//   //   if (blockResources.includes(req.resourceType())) {
//   //     req.abort();
//   //   } else {
//   //     req.continue();
//   //   }
//   // });

//   // let name = "", phone = "", address = "", website = "", brands = "", workingHours = "", legalInfo = "";
//   // try {
//   //   // extract data
//   //   name = await page.$$eval('.header-main-infos .denom h1.noTrad', (element) => element[0]?.innerText.trim() || "");
//   //   phone = await page.$$eval('span.nb-phone span.coord-numero', (element) => element[0]?.innerText.trim().toLowerCase() || "");
//   //   address = await page.$$eval('.address-container span.noTrad', (element) => element[0]?.innerText.trim().toLowerCase() || "");
//   //   website = await page.$$eval('.lvs-container span.value', (element) => element[0]?.innerText.trim() || "");
//   //   brands = await page.$$eval('.marques ul.liste-logos li', (elements) => {
//   //     return elements.map((element) => element?.innerText.trim() || "");
//   //   });
//   //   workingHours = await page.$$eval('.zone-informations-pratiques #bloc-horaires #infos-horaires ul.liste-horaires-principaux li', (elements) => {
//   //     return elements.map((element) => {
//   //       const day = element.querySelector('p.jour')?.innerText?.trim() || "";
//   //       const hours = element.querySelector('p.liste span.horaire')?.innerText?.trim().split(" - ") || [];
//   //       return { day, hours };
//   //     })
//   //   });

//   //   legalInfo = await page.evaluate(() => {
//   //     const establishmentInfo = {};
//   //     const companyInfo = {};

//   //     // Extract establishment data
//   //     const establishmentElements = document.querySelectorAll('.info-etablissement dt');
//   //     establishmentElements.forEach(dt => {
//   //       const key = dt.textContent.trim();
//   //       const value = dt.nextElementSibling.querySelector('strong')?.textContent.trim() || '';
//   //       establishmentInfo[key] = value;
//   //     });

//   //     // Extract company data
//   //     // eslint-disable-next-line no-undef
//   //     const companyElements = document.querySelectorAll('.info-entreprise dt');
//   //     companyElements.forEach(dt => {
//   //       const key = dt.textContent.trim();
//   //       const value = dt.nextElementSibling.querySelector('strong')?.textContent.trim() || '';
//   //       companyInfo[key] = value;
//   //     });
//   //     return { establishmentInfo, companyInfo };
//   //   });
//   // } catch (error) {
//   //   throw new Error(`Error Scraping Data: ${error.message}`);
//   // }
//   // return { name, phone, address, website, brands, workingHours, legalInfo };
// };

const scrapePage = async (page) => {
  let name = "", phone = "", address = "", website = "", brands = "", workingHours = "", legalInfo = {};
  try {
    // Load HTML into Cheerio
    const $ = cheerio.load(page);

    // Extract data
    name = $('.header-main-infos .denom h1.noTrad').first().text().trim() || "";
    phone = $('span.nb-phone span.coord-numero').first().text().trim().toLowerCase() || "";
    address = $('.address-container span.noTrad').first().text().trim().toLowerCase() || "";
    website = $('.lvs-container span.value').first().text().trim() || "";

    brands = $('.marques ul.liste-logos li')
      .map((_, element) => $(element).text().trim() || "")
      .toArray();

    workingHours = $('#bloc-horaires #infos-horaires ul.liste-horaires-principaux li')
      .map((_, element) => {
        const day = $(element).find('p.jour').text().trim() || "";
        const hours = $(element).find('p.liste span.horaire').text().trim().split(" - ") || [];
        return { day, hours };
      })
      .toArray();

    legalInfo = {
      establishmentInfo: {},
      companyInfo: {}
    };

    // Extract establishment data
    $('.info-etablissement dt').each((_, element) => {
      const key = $(element).text().trim();
      const value = $(element).next('dd').find('strong').text().trim() || '';
      legalInfo.establishmentInfo[key] = value;
    });

    // Extract company data
    $('.info-entreprise dt').each((_, element) => {
      const key = $(element).text().trim();
      const value = $(element).next('dd').find('strong').text().trim() || '';
      legalInfo.companyInfo[key] = value;
    });

  } catch (error) {
    throw new Error(`Error Scraping Data: ${error.message}`);
  }
  return { name, phone, address, website, brands, workingHours, legalInfo };
};

const constructUrlWithParams = (baseUrl, queryParams) => {
  try {
    return `${baseUrl}?${Object.entries(queryParams).map(([key, value]) => `${key}=${value}`).join('&')}`;
  } catch (error) {
    throw new Error(`Error Constructing Url With Params: ${error.message}`);
  }
};

const constructQuery = (baseUrl, combo, contexte = undefined, pageNumber = undefined) => {
  try {
    const constructed = `${baseUrl}?${Object.entries(combo).map(([key, value]) => `${key}=${value}`).join('&')}`;
    if (contexte && pageNumber) {
      return constructed.concat(`&contexte=${contexte}&page=${pageNumber}`);
    };
    return constructed;
  } catch (error) {
    throw new Error(`Error Constructing Query: ${error.message}`);
  }
};

const crawlPages = async (scrapingQueue, { pageNumber = 1, baseUrl, combo, maxPages, maxResults, queryParams }) => {
  try {
    // const { contexte } = queryParams;
    const browser = await getBrowserInstance();
    const page = await browser.newPage();
    console.log(`page: ${pageNumber} of ${maxPages}`);
    if (pageNumber <= maxPages) {
      const url = constructUrlWithParams(baseUrl, { ...combo, ...queryParams, page: pageNumber });
      const context = { useCase: "search" };
      await setUpPage(page, { url, context });
      queryParams = await handleContext(url, queryParams, { context });
      await handleTurnStile(page, { context, withDelay: true, delayTime: 5000 });
      await handleConsent(page, { context, withDelay: false });
      await handlePopIns(page, { context, withDelay: false });
      // extract pjId and save to database
      const pjIds = await page.$$eval('#listResults ul li', (elements) => {
        return elements
          .filter(({ id }) => !!id)
          .map((element) => element?.id?.split("bi-")[1].trim());
      });

      // we are here
      pjIds.forEach((pjId) => console.log("===> pjId:", pjId));
      const createLeadsForJob = pjIds.map((pjId) => {
        const lead = new Lead({ data: { pjId } });
        return Promise.all([
          // saving promise
          lead.save(),
          // scraping promise
          scrapingQueue.add(`scraping-of-${pjId}`, { leadId: lead._id.toHexString(), pjId: lead.data.pjId }),
        ]);
      });
      // woah
      await Promise.all(createLeadsForJob);

      // increment page number and crawl next page
      queryParams.page = pageNumber++;
      await crawlPages(scrapingQueue, { pageNumber, baseUrl, combo, maxPages, maxResults, queryParams });
    }
    // always close page after use
    await page.close();
    return { success: `Crawled Pages of Combo: ${JSON.stringify(combo)} Successfully` };
  } catch (error) {
    await closeBrowserInstance();
    throw new Error(`Error Crawling Page: ${error.message}`);
  }
};

const constructUrl = async ({ baseUrl, queryParams, pjId }) => {
  try {
    if (pjId) {
      return `https://www.pagesjaunes.fr/pros/${pjId}`;
    }

    if (pageNumber) {
      return constructUrlWithParams(baseUrl, queryParams);
    }

    throw new Error("Nothing Received");
  } catch (error) {
    throw new Error(`Error Constructing Url: ${error.message}`);
  }
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
  scrapePage,
  constructUrlWithParams,
  constructQuery,
  crawlPages,
  constructUrl
};