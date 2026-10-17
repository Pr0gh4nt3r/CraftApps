import path from 'node:path';

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface Config {
  port: number;
  dataDir: string;
  webDir: string;
  owner: string;
  githubToken: string | undefined;
  trustProxy: string;
  db: DbConfig;
  initialAdmin: { username: string; password: string } | undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const adminUser = env.INITIAL_ADMIN_USER?.trim();
  const adminPassword = env.INITIAL_ADMIN_PASSWORD ?? '';
  return {
    port: Number(env.PORT ?? 3000),
    dataDir: path.resolve(env.DATA_DIR ?? '/data'),
    webDir: path.resolve(import.meta.dirname, '../web'),
    owner: env.GITHUB_OWNER?.trim() || 'storytold',
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
    // Reverse proxies in the Docker or home network (e.g. Zoraxy) may set X-Forwarded-*
    trustProxy: env.TRUST_PROXY?.trim() || 'loopback,linklocal,uniquelocal',
    db: {
      host: required(env, 'DB_HOST'),
      port: Number(env.DB_PORT ?? 3306),
      user: required(env, 'DB_USER'),
      password: env.DB_PASSWORD ?? '',
      database: required(env, 'DB_NAME'),
    },
    initialAdmin: adminUser && adminPassword ? { username: adminUser, password: adminPassword } : undefined,
  };
}
