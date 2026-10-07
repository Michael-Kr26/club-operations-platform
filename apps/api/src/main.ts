import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 8_000_000 }),
  );

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.enableCors({
    credentials: true,
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
  });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host))
    throw new Error(
      'Deze lokale rapportageversie mag alleen op loopback luisteren.',
    );
  await app.listen(port, host);
}

void bootstrap();
