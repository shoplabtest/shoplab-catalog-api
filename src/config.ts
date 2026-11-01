export interface Config {
  port: number;
  databaseUrl: string;
  rabbitUrl: string | undefined;
  jwtSecret: string;
  pageSize: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3002),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5432/catalog',
    rabbitUrl: env.RABBITMQ_URL,
    jwtSecret: env.JWT_SECRET ?? 'dev-only-secret',
    pageSize: Number(env.PAGE_SIZE ?? 20),
  };
}
