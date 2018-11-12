const fs = require("fs");

const pontoonql = require("pontoonql");
const puppeteer = require("puppeteer");
const devices = require("puppeteer/DeviceDescriptors");
// const rimraf = require("rimraf").sync;

const iPhone8 = devices["iPhone 8"];

const servers = new Map([
  ["dev", "http://fx-breach-alerts.herokuapp.com"],
  ["stage", "https://blurts-server.stage.mozaws.net"],
  ["production", "https://monitor.firefox.com"]
]);

const env = process.env.ENV || process.argv[2] || "dev";
const desktop = process.env.DESKTOP === "true" || process.argv[3] === "true" || false ;

main(env, desktop, "linkedin");

async function main(env, desktop=true, breach) {
  const locales = await getLocales("firefox-monitor-website", 80);
  const pageUrl = servers.get(env) + (breach ? `?breach=${breach}` : "");
  const breachSuffix = breach ? `-${breach}` : "";

  const desktopOrMobile = desktop ? "desktop" : "mobile";

  process.setMaxListeners(0);
  // rimraf("shots/*.png");

  for (const locale of locales) {
    try {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        "Accept-Language": locale
      });

      if (desktop) {
        await page.setViewport({ width: 1280, height: 3000 });
      } else {
        await page.emulate(iPhone8);
        const {width} = page.viewport();
        await page.setViewport({ width, height: 5000 });
      }

      await page.goto(pageUrl);
      await page.screenshot({ path: `shots/${locale}-${desktopOrMobile}${breachSuffix}.png` });
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  }

  const docs = locales.map(locale => `### ${locale}\n![](${locale}-${desktopOrMobile}${breachSuffix}.png)\n`);
  docs.unshift(pageUrl, new Date().toLocaleDateString());

  fs.writeFileSync(`shots/README-${desktopOrMobile}${breachSuffix}.md`, docs.join("\n"));

  process.exit();
}

async function getLocales(project, threshold=80) {
  const locales = await pontoonql(project, threshold);
  return locales.map(({locale}) => locale.code).sort();
}
