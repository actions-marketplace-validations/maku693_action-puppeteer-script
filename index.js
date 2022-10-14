const fs = require("fs/promises");
const path = require("path");
const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const puppeteer = require("puppeteer-core");
const { fetch } = require("undici");

async function main() {
  const script = core.getInput("script", { required: true });

  const chromiumPath = await findOrDownloadChromium();
  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
  });

  const args = { browser };

  try {
    const result = callAsyncFunction(args, script);
    core.setOutput(JSON.stringify(result));
  } catch (error) {
    core.setFailed(error.message);
  }

  await browser.close();
}

async function findOrDownloadChromium() {
  core.info("Fetching latest chrome revison");
  const latestRevision = await (async () => {
    const res = await fetch(
      "https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Mac%2FLAST_CHANGE?alt=media"
    );
    return res.text();
  })();
  core.info(`Latest Chromium revision: ${latestRevision}`);

  // Download and create cache if cache is not found
  let cachedPath = tc.find("chromium", latestRevision);
  if (cachedPath) {
    core.info("Using cached Chromium");
  } else {
    core.info(`Chromium cache not found; Downloading`);
    const downloadPath = path.resolve(__dirname, "tmp");
    const browserFetcher = new puppeteer.BrowserFetcher({
      path: downloadPath,
    });
    const revisionInfo = await browserFetcher.download(
      latestRevision,
      (x, y) => {
        core.debug(`Download progress: ${x}/${y}`);
      }
    );
    core.info("Download finished!");

    core.debug("Revision info: ", revisionInfo);

    // Create symlink to launch the executable easily
    await fs.symlink(
      revisionInfo.executablePath,
      path.join(revisionInfo.folderPath, "chromium")
    );

    cachedPath = await tc.cacheDir(
      revisionInfo.folderPath,
      "chromium",
      latestRevision
    );
  }

  core.debug(`Cached path: ${cachedPath}`);

  return path.join(cachedPath, "chromium");
}

const AsyncFunction = (async () => {}).constructor;

async function callAsyncFunction(args, source) {
  const fn = new AsyncFunction(...Object.keys(args), source);
  return fn(...Object.values(args));
}

function handleError(error) {
  console.error(error);
  core.setFailed(error);
}

main().catch(handleError);
process.on("unhandledRejection", handleError);
