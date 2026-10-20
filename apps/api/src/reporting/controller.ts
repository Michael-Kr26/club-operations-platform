import {
  All,
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Dataset, ImportMeta, ReportSettings } from '@cop/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { requirePermission, ReportingService, WEB_ORIGIN } from './service.js';

function headers(req: FastifyRequest) {
  return new Headers(
    Object.entries(req.headers).flatMap(([k, v]) =>
      v === undefined
        ? []
        : [[k, Array.isArray(v) ? v.join(',') : v] as [string, string]],
    ),
  );
}
function checkOrigin(req: FastifyRequest) {
  if (req.headers.origin !== WEB_ORIGIN)
    throw new BadRequestException(
      'Wijzigingen alleen vanuit de lokale COP-browser.',
    );
}
@Controller()
export class LocalAuthController {
  constructor(
    @Inject(ReportingService) private readonly reports: ReportingService,
  ) {}
  @Get('reporting-status') status() {
    return this.reports.status();
  }
  @Post('reporting-setup') setup(
    @Req() req: FastifyRequest,
    @Body()
    body: { token: string; email: string; password: string; name: string },
  ) {
    checkOrigin(req);
    return this.reports.setup(body);
  }
  @All('local-auth/*') async auth(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    this.reports.ensureReady();
    const path = req.url.split('?')[0]?.split('/local-auth/')[1];
    // No HTTP registration, password reset email, verification emails or account-change surfaces in local v1.
    if (!(
      (req.method === 'GET' && path === 'get-session') ||
      (req.method === 'POST' &&
        ['sign-in/email', 'sign-out'].includes(path ?? ''))
    ))
      return reply
        .status(404)
        .send({ message: 'Niet beschikbaar in lokale rapportages.' });
    if (req.method !== 'GET') checkOrigin(req);
    const response = await this.reports.auth.handler(
      new Request(`http://localhost:3000${req.url}`, {
        method: req.method,
        headers: headers(req),
        body: req.method === 'GET' ? undefined : JSON.stringify(req.body),
      }),
    );
    reply.status(response.status);
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') reply.header(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header('set-cookie', cookies);
    return reply.send(await response.text());
  }
}
@Controller('organizations/:organizationId/reports')
export class ReportsController {
  constructor(
    @Inject(ReportingService) private readonly reports: ReportingService,
  ) {}
  private access(req: FastifyRequest, org: string, write = false) {
    if (req.method !== 'GET') checkOrigin(req);
    return this.reports.principal(
      headers(req),
      org,
      write ? 'reports.manage' : 'reports.read',
    );
  }
  @Get('access') async accessInfo(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
  ) {
    return this.access(req, org);
  }
  @Get() async report(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Query('dataset') dataset: Dataset = 'real',
    @Query('kind') kind: 'daily' | 'weekly' | 'monthly' = 'daily',
    @Query('date') date: string,
  ) {
    return this.reports.report(
      await this.access(req, org),
      dataset,
      kind,
      date,
    );
  }
  @Get('preview') async preview(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Query('dataset') dataset: Dataset = 'real',
    @Query('kind') kind: 'daily' | 'weekly' | 'monthly' = 'daily',
    @Query('date') date: string,
  ) {
    return this.reports.preview(
      await this.access(req, org),
      dataset,
      kind,
      date,
    );
  }
  @Get('weekly-series') async weeklySeries(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Query('dataset') dataset: Dataset = 'real',
    @Query('date') date: string,
    @Query('count') count = '12',
  ) {
    return this.timeSeries(req, org, dataset, date, count, 'weekly');
  }
  @Get('daily-series') async dailySeries(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Query('dataset') dataset: Dataset = 'real',
    @Query('date') date: string,
    @Query('count') count = '12',
  ) {
    return this.timeSeries(req, org, dataset, date, count, 'daily');
  }
  private async timeSeries(
    req: FastifyRequest,
    org: string,
    dataset: Dataset,
    date: string,
    count: string,
    kind: 'daily' | 'weekly',
  ) {
    const principal = await this.access(req, org),
      n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 16)
      throw new BadRequestException('Kies 1–16 perioden.');
    const latest = await this.reports.report(principal, dataset, kind, date),
      reports = [latest];
    for (let i = 1; i < n; i++) {
      const d = new Date(latest.from);
      d.setUTCDate(d.getUTCDate() - (kind === 'weekly' ? 7 : 1) * i);
      reports.push(
        await this.reports.report(
          principal,
          dataset,
          kind,
          d.toISOString().slice(0, 10),
        ),
      );
    }
    return { reports: reports.reverse() };
  }
  @Get('mail-status') async mailStatus(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
  ) {
    return this.reports.mailStatus(await this.access(req, org, true));
  }
  @Post('send') async send(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body()
    body: {
      dataset: Dataset;
      kind: 'daily' | 'weekly' | 'monthly';
      date: string;
    },
  ) {
    return this.reports.send(
      await this.access(req, org, true),
      body.dataset,
      body.kind,
      body.date,
    );
  }
  @Post('capture') async capture(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body()
    body: {
      dataset: Dataset;
      kind: 'daily' | 'weekly' | 'monthly';
      date: string;
    },
  ) {
    return this.reports.capture(
      await this.access(req, org, true),
      body.dataset,
      body.kind,
      body.date,
    );
  }
  @Get('source-status') async sourceStatus(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
  ) {
    return this.reports.sourceStatus(await this.access(req, org, true));
  }
  @Get('settings') async settings(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
  ) {
    await this.access(req, org, true);
    return this.reports.store.settings(org);
  }
  @Put('settings') async saveSettings(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: ReportSettings,
  ) {
    return this.reports.updateSettings(await this.access(req, org, true), body);
  }
  @Get('imports') async imports(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Query('dataset') dataset: Dataset = 'real',
  ) {
    await this.access(req, org, true);
    if (!['real', 'demo'].includes(dataset))
      throw new BadRequestException('Ongeldige dataset.');
    return (await this.reports.store.imports(org, dataset)).map(
      ({ rows, ...i }) => ({ ...i, rowCount: rows.length }),
    );
  }
  @Post('imports') async import(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: { meta: ImportMeta; filename: string; content: string },
  ) {
    return this.reports.importFile(await this.access(req, org, true), body);
  }
  @Post('demo') async demo(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: { date: string },
  ) {
    return this.reports.demo(await this.access(req, org, true), body.date);
  }
  @Get('imports/:id/original') async original(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.access(req, org, true);
    const file = await this.reports.store.original(org, id);
    if (!file)
      return reply.status(404).send({ message: 'Import niet gevonden.' });
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.original);
  }
  @Get('workbooks') async workbooks(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Query('dataset') dataset: Dataset = 'real',
  ) {
    return this.reports.workbookDashboard(await this.access(req, org), dataset);
  }
  @Post('workbooks') async importWorkbook(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: Parameters<ReportingService['importWorkbook']>[1],
  ) {
    return this.reports.importWorkbook(await this.access(req, org, true), body);
  }
  @Post('workbooks/zip') async importWorkbookZip(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: Parameters<ReportingService['importWorkbookZip']>[1],
  ) {
    return this.reports.importWorkbookZip(
      await this.access(req, org, true),
      body,
    );
  }
  @Post('workbooks/preview') async previewWorkbook(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: Parameters<ReportingService['previewWorkbook']>[1],
  ) {
    return this.reports.previewWorkbook(
      await this.access(req, org, true),
      body,
    );
  }
  @Post('workbooks/inbox') async scanWorkbookInbox(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: Parameters<ReportingService['scanWorkbookInbox']>[1],
  ) {
    return this.reports.scanWorkbookInbox(
      await this.access(req, org, true),
      body,
    );
  }
  @Post('workbooks/preferences') async workbookPreferences(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Body() body: Parameters<ReportingService['workbookPreferences']>[1],
  ) {
    return this.reports.workbookPreferences(
      await this.access(req, org, true),
      body,
    );
  }
  @Get('workbooks/:id/original') async workbookOriginal(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    requirePermission(await this.access(req, org, true), org, 'reports.manage');
    const file = await this.reports.workbooks.original(org, id);
    if (!file)
      return reply.status(404).send({ message: 'Import niet gevonden.' });
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.original);
  }
  @Get('runs') async runs(
    @Req() req: FastifyRequest,
    @Param('organizationId') org: string,
    @Query('dataset') dataset: Dataset = 'real',
  ) {
    await this.access(req, org, true);
    if (!['real', 'demo'].includes(dataset))
      throw new BadRequestException('Ongeldige dataset.');
    return this.reports.store.runs(org, dataset);
  }
}
