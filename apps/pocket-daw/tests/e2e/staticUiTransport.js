import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

/** Optional production-build transport for socket-restricted test environments. */
export async function serveBuiltUi(page) {
  if (!process.env.POCKET_DAW_UI_STATIC_DIR) return;
  const root = resolve(process.env.POCKET_DAW_UI_STATIC_DIR);
  await page.route("http://pocket-daw.test/**", async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!path.startsWith(root + "/") && !path.startsWith(root + "\\")) return route.abort();
    try {
      const contentType = ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" })[extname(path)] || "application/octet-stream";
      await route.fulfill({ body: await readFile(path), contentType });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
}
