import { Module } from '@nestjs/common';

import { HealthController } from './health/health.controller.js';
import {
  LocalAuthController,
  ReportsController,
} from './reporting/controller.js';
import { ReportingService } from './reporting/service.js';

@Module({
  controllers: [HealthController, LocalAuthController, ReportsController],
  providers: [ReportingService],
})
export class AppModule {}
