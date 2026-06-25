#!/usr/bin/env node
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const limitKB = Number(process.argv[2]) || 500;
const rendererDir = "out/renderer";

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const chunks = walk(rendererDir).filter((f) => /\.(js|css)$/.test(f));

let failed = false;

for (const file of chunks) {
  const raw = statSync(file).size;
  const gzipped = execSync(`gzip -c "${file}" | wc -c`, {
    encoding: "utf8",
  }).trim();
  const gzipKB = (Number(gzipped) / 1024).toFixed(1);
  const status = Number(gzipKB) > limitKB ? "FAIL" : "ok";
  console.log(
    `${status}  ${file}  raw=${(raw / 1024).toFixed(1)}KB  gzip=${gzipKB}KB`,
  );
  if (status === "FAIL") failed = true;
}

if (failed) {
  console.error(`\nRenderer chunk(s) exceed gzip limit of ${limitKB}KB`);
  process.exit(1);
} else {
  console.log(`\nAll renderer chunks within ${limitKB}KB gzip limit`);
}
