import "server-only";

/**
 * Where the desktop installers come from. The /desktop page links to the
 * latest `desktop-v*` GitHub release of this repository. Upstream builds work
 * with any deployment (the app asks for the server on first launch), so
 * self-hosters can leave the default; forks that ship their own build point
 * it at their repository.
 */
const DEFAULT_RELEASES_REPO = "0xmattthemii/toodoo";

export function desktopReleasesRepo() {
  return (process.env.DESKTOP_RELEASES_REPO ?? "").trim() || DEFAULT_RELEASES_REPO;
}

export type DesktopDownloads = {
  /** Latest desktop version, e.g. "0.1.0" — null when it couldn't be resolved. */
  version: string | null;
  /** Release page to fall back to (always available). */
  releasesUrl: string;
  /** Direct installer URLs when the latest release has them. */
  macos: string | null;
  windows: string | null;
};

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
};

/**
 * Resolve direct download links for the latest published desktop release.
 * Cached for five minutes (a dozen GitHub API calls an hour, far below the
 * unauthenticated limit) so a freshly published release shows up quickly; any
 * failure degrades to the releases page rather than breaking the /desktop page.
 */
export async function getDesktopDownloads(): Promise<DesktopDownloads> {
  const repo = desktopReleasesRepo();
  const fallback: DesktopDownloads = {
    version: null,
    releasesUrl: `https://github.com/${repo}/releases`,
    macos: null,
    windows: null,
  };
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "toodoo",
        },
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) return fallback;
    const releases: GitHubRelease[] = await response.json();
    // Desktop releases are tagged desktop-vX.Y.Z; other releases in the repo
    // (web app) are ignored.
    const release = releases.find(
      (r) => r.tag_name.startsWith("desktop-v") && !r.draft && !r.prerelease,
    );
    if (!release) return fallback;
    const asset = (matches: (name: string) => boolean) =>
      release.assets.find((a) => matches(a.name))?.browser_download_url ?? null;
    return {
      version: release.tag_name.replace(/^desktop-v/, ""),
      releasesUrl: release.html_url,
      macos: asset((name) => name.endsWith(".dmg")),
      windows: asset(
        (name) => name.endsWith("-setup.exe") || name.endsWith(".msi"),
      ),
    };
  } catch {
    return fallback;
  }
}
