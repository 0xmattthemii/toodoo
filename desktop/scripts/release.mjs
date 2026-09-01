#!/usr/bin/env node
// Bump the desktop app version everywhere it lives, commit, and tag.
//
//   pnpm --dir desktop release patch|minor|major|<x.y.z> [--no-git]
//
// Pushing the tag (git push --follow-tags) triggers the desktop release
// workflow, which builds, signs updater artifacts, and drafts a GitHub
// release. Publishing that release makes the update live for existing
// installs via .../releases/latest/download/latest.json.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const files = {
  pkg: join(desktopDir, "package.json"),
  conf: join(desktopDir, "src-tauri", "tauri.conf.json"),
  cargo: join(desktopDir, "src-tauri", "Cargo.toml"),
};

const arg = process.argv[2];
const noGit = process.argv.includes("--no-git");
if (!arg) {
  console.error("Usage: pnpm --dir desktop release patch|minor|major|<x.y.z> [--no-git]");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(files.pkg, "utf8"));
const current = pkg.version;
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [maj, min, pat] = current.split(".").map(Number);
  next = { major: `${maj + 1}.0.0`, minor: `${maj}.${min + 1}.0`, patch: `${maj}.${min}.${pat + 1}` }[arg];
  if (!next) {
    console.error(`Unknown bump "${arg}" (expected patch, minor, major, or x.y.z)`);
    process.exit(1);
  }
}

pkg.version = next;
writeFileSync(files.pkg, JSON.stringify(pkg, null, 2) + "\n");

const conf = JSON.parse(readFileSync(files.conf, "utf8"));
conf.version = next;
writeFileSync(files.conf, JSON.stringify(conf, null, 2) + "\n");

const cargo = readFileSync(files.cargo, "utf8");
writeFileSync(files.cargo, cargo.replace(/^version = ".*"$/m, `version = "${next}"`));

// Refresh Cargo.lock so it matches the new package version (no compile).
try {
  execFileSync("cargo", ["metadata", "--format-version", "1"], {
    cwd: join(desktopDir, "src-tauri"),
    stdio: ["ignore", "ignore", "inherit"],
  });
} catch {
  console.warn("warning: could not run `cargo metadata` — Cargo.lock not refreshed");
}

console.log(`${current} -> ${next}`);

if (!noGit) {
  const tag = `desktop-v${next}`;
  const changed = [files.pkg, files.conf, files.cargo, join(desktopDir, "src-tauri", "Cargo.lock")];
  execFileSync("git", ["add", ...changed], { cwd: desktopDir });
  execFileSync("git", ["commit", "-m", `desktop: release v${next}`], { cwd: desktopDir, stdio: "inherit" });
  execFileSync("git", ["tag", tag], { cwd: desktopDir });
  console.log(`\nTagged ${tag}. To release:\n\n  git push --follow-tags\n`);
}
