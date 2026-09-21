import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@cop/contracts';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      service: 'cop-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
