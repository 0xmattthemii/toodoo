#!/usr/bin/env node
// Make the desktop app's identity and update channel configurable without
// editing tauri.conf.json, so a fork can ship its own build straight from CI.
// Run by .github/workflows/desktop.yml before `tauri build`; usable locally too.
//
//   GITHUB_REPOSITORY       owner/repo the build runs in (set by GitHub Actions).
//                           The updater endpoint always points at this repo's
//                           floating `updater` release.
//   DESKTOP_BUNDLE_ID       Reverse-DNS bundle identifier, e.g. com.acme.toodoo.
//                           Required outside the upstream repo: two apps with
//                           the same identifier share settings and can't be
//                           installed side by side.
//   DESKTOP_UPDATER_PUBKEY  minisign public key matching the repo's
//                           TAURI_SIGNING_PRIVATE_KEY secret. Required outside
//                           the upstream repo, otherwise installs would verify
//                           updates against the upstream key and never update.
//
// Nothing is changed when run in the upstream repo without variables.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_REPO = "0xmattthemii/toodoo";

const confPath = join(dirname(dirname(fileURLToPath(import.meta.url))), "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));

const repo = (process.env.GITHUB_REPOSITORY ?? "").trim();
const bundleId = (process.env.DESKTOP_BUNDLE_ID ?? "").trim();
const pubkey = (process.env.DESKTOP_UPDATER_PUBKEY ?? "").trim();
const isFork = repo !== "" && repo.toLowerCase() !== UPSTREAM_REPO.toLowerCase();

const errors = [];
if (isFork && !bundleId) {
  errors.push(
    `DESKTOP_BUNDLE_ID is not set. ${repo} is not the upstream repository (${UPSTREAM_REPO}); ` +
      "set the repository variable to your own reverse-DNS identifier (e.g. com.acme.toodoo).",
  );
}
if (isFork && !pubkey) {
  errors.push(
    "DESKTOP_UPDATER_PUBKEY is not set. Forks must sign updates with their own key: " +
      "run `pnpm tauri signer generate -w ~/.tauri/toodoo.key`, store the private key as the " +
      "TAURI_SIGNING_PRIVATE_KEY secret and the printed public key as this repository variable.",
  );
}
// Same rules Tauri applies: reverse-DNS characters only, and not ending in
// `.app` (macOS treats that as a bundle extension).
if (bundleId && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(bundleId)) {
  errors.push(`DESKTOP_BUNDLE_ID "${bundleId}" may only contain letters, digits, dots and hyphens.`);
}
if (bundleId && bundleId.toLowerCase().endsWith(".app")) {
  errors.push(`DESKTOP_BUNDLE_ID "${bundleId}" must not end with ".app".`);
}
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

const changes = [];
if (bundleId && conf.identifier !== bundleId) {
  changes.push(`identifier: ${conf.identifier} -> ${bundleId}`);
  conf.identifier = bundleId;
}
if (pubkey && conf.plugins.updater.pubkey !== pubkey) {
  changes.push("updater public key replaced");
  conf.plugins.updater.pubkey = pubkey;
}
if (repo) {
  const endpoint = `https://github.com/${repo}/releases/download/updater/latest.json`;
  if (conf.plugins.updater.endpoints[0] !== endpoint) {
    changes.push(`updater endpoint: ${conf.plugins.updater.endpoints[0]} -> ${endpoint}`);
    conf.plugins.updater.endpoints = [endpoint];
  }
}

if (changes.length) {
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
  console.log(`Configured ${confPath}:\n  ${changes.join("\n  ")}`);
} else {
  console.log(`No configuration changes for ${repo || "local build"}.`);
}
