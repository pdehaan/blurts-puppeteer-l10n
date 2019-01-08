#!/usr/bin/env node

'use strict';

const fs = require("fs");
const path = require("path");

const got = require("got");
const meow = require("meow");
const mkdirp = require("mkdirp").sync;
const pontoonql = require("pontoonql");
const puppeteer = require("puppeteer");
const devices = require("puppeteer/DeviceDescriptors");

const servers = new Map([
  ["l10n", "https://fx-breach-alerts.herokuapp.com"],
  ["dev", "https://fx-breach-alerts.herokuapp.com"],
  ["stage", "https://blurts-server.stage.mozaws.net"],
  ["production", "https://monitor.firefox.com"],
  ["gcp", "http://stage.firefoxmonitor.nonprod.cloudops.mozgcp.net"]
]);

const mobileDevice = devices["iPhone 8"];

const cli = meow(`
  Usage:
    $ scrape --env l10n -b=linkedin --mobile --desktop

  Options:
    --env, -e      One of: "l10n" | "dev" | "stage" | "production".
    --breach, -b   Name/slug of the breach to scrape.
    --desktop, -d  Use a desktop-esque view port.
    --mobile, -m   Use a mobile (iPhone 8) viewport.
    --scrollingMobile  Use a mobile viewport, but capture the first 5000 pixels.
    --email-l10n   Something or such.

`, {
  flags: {
    env: {
      type: "string",
      default: "l10n",
      alias: "e"
    },
    breach: {
      type: "string",
      alias: "b",
      default: null
    },
    desktop: {
      type: 'boolean',
      alias: 'd',
      default: false
    },
    mobile: {
      type: 'boolean',
      alias: 'm',
      default: false
    },
    height: {
      type: "number"
    },
    emailL10n: {
      type: "string"
    },
    output: {
      type: "string",
      default: "shots"
    }
  }
});

run(cli.flags)
  .then(process.exit)
  .catch(err => {
    console.error(err);
    process.exit(2);
  });


function makeUrl(server, params={}) {
  const url = new URL(server);
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.append(key, value);
  }
  return url;
}

async function run(flags) {
  const opts = flags.breach ? {breach: flags.breach} : null;
  const {href} = makeUrl(servers.get(flags.env), opts);

  const {body} = await got.get(`${servers.get(flags.env)}/__version__`, {json: true});
  console.log(JSON.stringify(body));

  if (flags.hasOwnProperty("emailL10n")) {
    const l10nHref = `${servers.get(flags.env)}/email-l10n`;
    switch (flags.emailL10n) {
      case "":
        await scrape(l10nHref, {...flags, desktop: true});
        break;
      case "singleBreach":
      case "multipleBreaches":
      case "noBreaches":
      case "breachAlert":
        {
          const l10nReportHref = makeUrl(l10nHref, {partial: "report", type: flags.emailL10n});
          await scrape(l10nReportHref.href, {...flags, desktop: true});
        }
        break;
      default:
        throw new Error(`Unknown '--email-l10n' value: ${flags.emailL10n}`);
    }
    return;
  }

  if (flags.desktop) {
    await scrape(href, {...flags, desktop: true});
  }
  if (flags.mobile) {
    await scrape(href, {...flags, desktop: false});
  }
}

const locales = ["en-US"];

async function scrape(href, flags) {
  const locales = await getLocales("firefox-monitor-website", 80);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await setViewport(page, flags);

  console.log(`Scraping ${href} w/ ${JSON.stringify(flags, null, 2)}\n`);

  const outDir = path.join(__dirname, flags.output);
  mkdirp(outDir);

  const docs = locales.map(locale => `### ${locale}\n![](${locale}.png)\n`);
  docs.unshift(href, new Date().toLocaleDateString());

  fs.writeFileSync(path.join(outDir, "README.md"), docs.join("\n"));
  for (const locale of locales) {
    try {
      const outFile = path.join(outDir, `${locale}.png`);
      await page.setExtraHTTPHeaders({ "Accept-Language": locale });
      await page.goto(href);
      await page.screenshot({ path: outFile });
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  }
}

async function setViewport(page, flags) {
  if (flags.desktop) {
    await page.setViewport({ width: 1280, height: flags.height || 3000 });
  } else if (flags.mobile) {
    await page.emulate(mobileDevice);
    if (flags.height) {
      const { width } = page.viewport();
      await page.setViewport({ width, height: flags.height || 5000 });
    }
  }
}

async function getLocales(project, threshold=80) {
  const locales = await pontoonql(project, threshold);
  return locales.map(({locale}) => locale.code).sort();
}
