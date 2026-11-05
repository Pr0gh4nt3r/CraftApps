import { findWebAsset, type Release } from './github.js';
import type { Asset } from './installer.js';

/** A release that comes into question for one of the update channels */
export interface Candidate {
  tag: string;
  publishedAt: string | null;
  /** stable, rc, beta, alpha, … – see releaseChannel */
  channel: string;
  /** The web zip, null while the release pipeline is still uploading it (or there is none) */
  asset: Asset | null;
}

// Most mature first: a channel takes releases of its own and of every more mature one, beta
// e.g. also rc and stable. Unknown names (nightly, preview, …) come after alpha.
const MATURITY = ['stable', 'rc', 'beta', 'alpha'];
const maturity = (channel: string) => (MATURITY.includes(channel) ? MATURITY.indexOf(channel) : MATURITY.length);

/** Channels most mature first, unknown ones alphabetically after alpha */
export const sortChannels = (channels: Iterable<string>): string[] =>
  [...new Set(channels)].sort((a, b) => maturity(a) - maturity(b) || a.localeCompare(b));

interface Version {
  numbers: [number, number, number];
  /** Pre-release part after the "-", e.g. "beta.2" – empty for a stable version */
  pre: string[];
}

/** Semantic version at the end of a tag: v1.2.3, 1.2.3-beta.1, artcraft-v0.41.0, … */
function parseVersion(tag: string): Version | null {
  const match = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(tag);
  if (!match) return null;
  return { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] };
}

/** Order as in semver.org: numbers first, a pre-release before its version; null if a tag isn't a version */
function compareVersions(a: string, b: string): number | null {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return null;
  for (let i = 0; i < 3; i++) if (va.numbers[i] !== vb.numbers[i]) return va.numbers[i] - vb.numbers[i];
  if (!va.pre.length || !vb.pre.length) return vb.pre.length - va.pre.length;
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    const [x, y] = [va.pre[i], vb.pre[i]];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Whether latest is newer than the installed version. So switching back to a more mature
 * channel never downgrades: 0.16.0-beta.1 stays until 0.16.0 is out. Tags that aren't
 * versions count as newer as soon as they differ.
 */
export function isNewer(latest: string | null, installed: string | null): boolean {
  if (!latest || latest === installed) return false;
  if (!installed) return true;
  return (compareVersions(latest, installed) ?? 1) > 0;
}

/**
 * Channel of a release: the name in its pre-release part (1.2.0-beta.1 → beta), "pre" for a
 * release GitHub marks as pre-release without such a name, otherwise stable.
 */
function releaseChannel(release: Release): string {
  const pre = parseVersion(release.tag_name)?.pre[0];
  if (pre) return /^[a-z]+/i.exec(pre)?.[0].toLowerCase() ?? 'pre';
  return release.prerelease ? 'pre' : 'stable';
}

/**
 * The releases that come into question, newest first: the newest stable one and the
 * pre-releases newer than it. Older pre-releases don't matter – any channel takes the newer
 * stable one – so their channels aren't offered either.
 */
export function releaseCandidates(appId: string, releases: Release[]): Candidate[] {
  const list = releases
    .filter((r) => !r.draft)
    .map((r, index) => ({ release: r, index }))
    // By version; GitHub's order (newest first) where a tag isn't one
    .sort((a, b) => -(compareVersions(a.release.tag_name, b.release.tag_name) ?? 0) || a.index - b.index)
    .map(({ release }): Candidate => {
      const asset = findWebAsset(appId, release);
      return {
        tag: release.tag_name,
        publishedAt: release.published_at,
        channel: releaseChannel(release),
        asset: asset
          ? { name: asset.name, size: asset.size, digest: asset.digest ?? null, url: asset.browser_download_url }
          : null,
      };
    });
  const stable = list.findIndex((c) => c.channel === 'stable');
  // At most 10 – the stable one always among them
  return stable === -1 ? list.slice(0, 10) : [...list.slice(0, Math.min(stable, 9)), list[stable]];
}

/** The newest candidate the channel takes */
export function pickRelease(candidates: Candidate[], channel: string): Candidate | null {
  return candidates.find((c) => maturity(c.channel) <= maturity(channel)) ?? null;
}
