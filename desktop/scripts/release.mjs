#!/usr/bin/env node
// Bump the desktop app version everywhere it lives, commit, and tag.
//
//   pnpm --dir desktop release patch|minor|major|<x.y.z> [--no-git]
//
// Pushing the tag (git push --follow-tags) triggers the desktop release
// workflow, which builds, signs updater artifacts, and drafts a GitHub
// release. Publishing that release makes the update live for existing
// installs via the `updater` release's latest.json.
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

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: desktopDir, encoding: "utf8", ...opts });

if (!noGit) {
  // Anything already staged would be swept into the release commit.
  try {
    git(["diff", "--cached", "--quiet"]);
  } catch {
    console.error("The git index is not clean — commit or unstage your changes first.");
    process.exit(1);
  }
}

const pkg = JSON.parse(readFileSync(files.pkg, "utf8"));
const current = pkg.version;
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [maj, min, pat] = current.split(".").map(Number);
  switch (arg) {
    case "major":
      next = `${maj + 1}.0.0`;
      break;
    case "minor":
      next = `${maj}.${min + 1}.0`;
      break;
    case "patch":
      next = `${maj}.${min}.${pat + 1}`;
      break;
    default:
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
if (!/^version = ".*"$/m.test(cargo)) {
  console.error(`Could not find a 'version = "..."' line to bump in ${files.cargo}`);
  process.exit(1);
}
writeFileSync(files.cargo, cargo.replace(/^version = ".*"$/m, `version = "${next}"`));

// Refresh Cargo.lock so it matches the new package version (no compile).
// A stale lockfile would ship a release whose crate version disagrees with
// the bundle version, so failure here aborts the release.
try {
  execFileSync("cargo", ["metadata", "--format-version", "1"], {
    cwd: join(desktopDir, "src-tauri"),
    stdio: ["ignore", "ignore", "inherit"],
  });
} catch {
  console.error("`cargo metadata` failed — is Rust installed? Aborting (files were modified).");
  process.exit(1);
}

console.log(`${current} -> ${next}`);

if (!noGit) {
  const tag = `desktop-v${next}`;
  const changed = [files.pkg, files.conf, files.cargo, join(desktopDir, "src-tauri", "Cargo.lock")];
  git(["add", "--", ...changed]);
  // Scoped to `changed` so nothing else can slip into the release commit;
  // -a (annotated) so `git push --follow-tags` actually pushes the tag.
  git(["commit", "-m", `desktop: release v${next}`, "--", ...changed], { stdio: "inherit" });
  git(["tag", "-a", tag, "-m", `Toodoo Desktop v${next}`]);
  console.log(`\nTagged ${tag}. To release:\n\n  git push --follow-tags\n`);
}
