import { USER_AGENT } from './util.js';

export interface Repo {
  name: string;
  description: string | null;
  fork: boolean;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  digest?: string | null;
  state?: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  published_at: string | null;
  assets: ReleaseAsset[];
}

export type LatestRelease =
  | { kind: 'not-modified' }
  | { kind: 'none' }
  | { kind: 'release'; release: Release; etag: string | null };

export class GitHubLimitError extends Error {}

/** Lean client for the public GitHub API (without a token: 60 requests per hour). */
export class GitHub {
  remaining: number | null = null;
  limit: number | null = null;
  resetAt: Date | null = null;

  constructor(private readonly token: string | undefined) {}

  private async request(path: string, etag?: string | null): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
    };
    if (etag) headers['If-None-Match'] = etag;
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(60_000) });
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null) {
      this.remaining = Number(remaining);
      this.limit = Number(res.headers.get('x-ratelimit-limit'));
      this.resetAt = new Date(Number(res.headers.get('x-ratelimit-reset')) * 1000);
    }
    if ((res.status === 403 || res.status === 429) && remaining === '0') {
      const at = this.resetAt?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      throw new GitHubLimitError(`GitHub-API-Limit erreicht, wieder frei ab ${at} Uhr`);
    }
    return res;
  }

  async listRepos(owner: string): Promise<Repo[]> {
    const repos: Repo[] = [];
    for (let page = 1; ; page++) {
      const res = await this.request(`/users/${owner}/repos?per_page=100&page=${page}`);
      if (!res.ok) throw new Error(`GitHub-API antwortet ${res.status} beim Auflisten der Repos`);
      const batch = (await res.json()) as Repo[];
      repos.push(...batch);
      if (batch.length < 100) return repos;
    }
  }

  /** Latest release; with an ETag GitHub answers "304 Not Modified" as long as nothing has changed. */
  async latestRelease(owner: string, repo: string, etag: string | null): Promise<LatestRelease> {
    const res = await this.request(`/repos/${owner}/${repo}/releases/latest`, etag);
    if (res.status === 304) return { kind: 'not-modified' };
    if (res.status === 404) return { kind: 'none' }; // Repo without any releases, e.g. AniCraft
    if (!res.ok) throw new Error(`GitHub-API antwortet ${res.status} für ${repo}`);
    return { kind: 'release', release: (await res.json()) as Release, etag: res.headers.get('etag') };
  }
}

/** The web zip of a release: <app>-web-<version>.zip, once it is fully uploaded. */
export function findWebAsset(appId: string, release: Release): ReleaseAsset | undefined {
  const pattern = new RegExp(`^${appId}-web-.+\\.zip$`, 'i');
  return release.assets.find((a) => pattern.test(a.name) && (a.state ?? 'uploaded') === 'uploaded');
}
