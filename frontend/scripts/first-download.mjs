// The game's first download: each JS and CSS file dist/index.html loads, with its gzipped size,
// then the total in bytes. Run it after `npm run build`; a stats phase leaves the total as it was
// (within the small margin its plan allows).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const html = readFileSync("dist/index.html", "utf8");
let total = 0;
for (const [, path] of html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)) {
  const size = gzipSync(readFileSync(`dist/${path}`)).length;
  total += size;
  console.log(path, size);
}
console.log("total", total);
