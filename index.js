const fs = require("fs");

const pontoonql = require("pontoonql");
const puppeteer = require("puppeteer");
const devices = require("puppeteer/DeviceDescriptors");
const rimraf = require("rimraf").sync;

const iPhone8 = devices["iPhone 8"];

const servers = new Map([
  ["dev", "http://fx-breach-alerts.herokuapp.com"],
  ["stage", "https://blurts-server.stage.mozaws.net"],
  ["production", "https://monitor.firefox.com"]
]);

main("dev", false);

async function main(env, desktop=true) {
  const locales = await getLocales("firefox-monitor-website", 80);
  const pageUrl = servers.get(env);

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
      }

      await page.goto(pageUrl);
      await page.screenshot({ path: `shots/${locale}-${desktopOrMobile}.png` });
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  }

  const docs = locales.map(locale => `### ${locale}\n![](${locale}-${desktopOrMobile}.png)\n`);
  docs.unshift(pageUrl, new Date().toLocaleDateString());

  fs.writeFileSync(`shots/README-${desktopOrMobile}.md`, docs.join("\n"));

  process.exit();
}

async function getLocales(project, threshold=80) {
  const locales = await pontoonql(project, threshold);
  return locales.map(({locale}) => locale.code).sort();
}
