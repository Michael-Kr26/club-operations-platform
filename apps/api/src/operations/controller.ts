import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type {
  Dataset,
  EmployeeRecord,
  ShiftRecord,
  TaskRecord,
  ChecklistRecord,
  AssetRecord,
  ContactRecord,
  ContactData,
} from '@cop/contracts';
import {
  ReportingService,
  WEB_ORIGIN,
  scopedOrganization,
} from '../reporting/service.js';
import type { OperationsStore } from './store.js';
import { memberDirectory } from './members.js';
function headers(req: FastifyRequest) {
  return new Headers(
    Object.entries(req.headers).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [
            [key, Array.isArray(value) ? value.join(',') : value] as [
              string,
              string,
            ],
          ],
    ),
  );
}
@Controller('organizations/:organizationId/operations')
export class OperationsController {
  constructor(@Inject(ReportingService) private reports: ReportingService) {}
  private access(
    req: FastifyRequest,
    org: string,
    permission:
      | 'operations.read'
      | 'operations.manage'
      | 'members.read' = 'operations.read',
  ) {
    if (req.method !== 'GET' && req.headers.origin !== WEB_ORIGIN)
      throw new BadRequestException(
        'Wijzigingen alleen vanuit de lokale COP-browser.',
      );
    return this.reports.principal(headers(req), org, permission);
  }
  @Get() async workspace(
    @Req() req: FastifyRequest,
    @Param('organizationId') orgId: string,
    @Query('dataset') dataset: Dataset = 'real',
  ) {
    const principal = await this.access(req, orgId),
      org = await this.reports.organization(orgId);
    const records = await this.reports.operations.list(principal, dataset);
    const reports = principal.permissions.includes('reports.read')
      ? await this.reports.workbookDashboard(principal, dataset)
      : null;
    return {
      organization: scopedOrganization(org, principal),
      principal,
      dataset,
      tasks: records.filter((r) => r.kind === 'task') as TaskRecord[],
      employees: records.filter(
        (r) => r.kind === 'employee',
      ) as EmployeeRecord[],
      shifts: records.filter((r) => r.kind === 'shift') as ShiftRecord[],
      checklists: records.filter(
        (r) => r.kind === 'checklist',
      ) as ChecklistRecord[],
      assets: records.filter((r) => r.kind === 'asset') as AssetRecord[],
      reports,
      warnings: [
        'Personeelsbezetting is geplande inzet. Een les of PT-dienst telt niet als beschikbare vloertijd. Bezettingsnormen zijn nog niet ingesteld.',
        'Een gepubliceerd rooster wordt opgeslagen in COP; er worden nog geen berichten naar medewerkers verstuurd.',
      ],
    };
  }
  @Post('records') async save(
    @Req() req: FastifyRequest,
    @Param('organizationId') orgId: string,
    @Body() body: Parameters<OperationsStore['save']>[2],
  ) {
    const principal = await this.access(req, orgId, 'operations.manage'),
      org = await this.reports.organization(orgId);
    if (
      !body ||
      !body.data ||
      typeof body.data !== 'object' ||
      Array.isArray(body.data)
    )
      throw new BadRequestException('Gegevens ontbreken.');
    if (body.kind === 'contact') {
      const value = body.data as ContactData;
      const directory = await memberDirectory(
        this.reports.workbooks,
        principal,
        body.dataset,
        value?.sourceId,
      );
      if (
        !directory.members.some(
          (m) => m.key === value.memberKey && m.locationId === body.locationId,
        )
      )
        throw new BadRequestException(
          'Kies een lid uit een toegankelijke bron van deze locatie.',
        );
    }
    const result = await this.reports.operations.save(org, principal, body);
    if (body.kind === 'checklist')
      await this.reports.operations.generateChecklists(
        org,
        principal,
        body.dataset,
      );
    return result;
  }
  @Get('members') async members(
    @Req() req: FastifyRequest,
    @Param('organizationId') orgId: string,
    @Query('dataset') dataset: Dataset = 'real',
    @Query('sourceId') sourceId?: string,
  ) {
    const principal = await this.access(req, orgId, 'members.read');
    if (!['real', 'demo'].includes(dataset))
      throw new BadRequestException('Ongeldige dataset.');
    const directory = await memberDirectory(
      this.reports.workbooks,
      principal,
      dataset,
      sourceId,
    );
    const records = principal.permissions.includes('operations.read')
      ? await this.reports.operations.list(principal, dataset)
      : [];
    return {
      ...directory,
      contacts: records.filter((r) => r.kind === 'contact') as ContactRecord[],
    };
  }
  @Post('report-task') async reportTask(
    @Req() req: FastifyRequest,
    @Param('organizationId') orgId: string,
    @Body()
    body: {
      dataset: Dataset;
      period: string;
      code: string;
      locationId: string;
    },
  ) {
    const principal = await this.access(req, orgId, 'operations.manage'),
      org = await this.reports.organization(orgId);
    await this.access(req, orgId, 'operations.read');
    await this.reports.principal(headers(req), orgId, 'reports.read');
    const report = await this.reports.workbookDashboard(
      principal,
      body.dataset,
    );
    const attention = report.combined.periods
      .find((p) => p.period === body.period)
      ?.attention?.find(
        (a) => a.code === body.code && a.locationId === body.locationId,
      );
    if (!attention)
      throw new BadRequestException(
        'Dit signaal is niet meer aanwezig. Vernieuw het dashboard.',
      );
    const key = `report:${body.period}:${body.code}:${body.locationId}`;
    return this.reports.operations.save(
      org,
      principal,
      {
        dataset: body.dataset,
        kind: 'task',
        locationId: body.locationId,
        data: {
          title: attention.message.slice(0, 200),
          description: `Rapportagesignaal ${body.period}: ${attention.message}`,
          assigneeId: null,
          dueDate: null,
          priority: 'high',
          status: 'open',
        },
      },
      {
        key,
        source: {
          type: 'report',
          key,
          ...(attention.sourceId ? { importId: attention.sourceId } : {}),
        },
      },
    );
  }
  @Post('member-task') async memberTask(
    @Req() req: FastifyRequest,
    @Param('organizationId') orgId: string,
    @Body()
    body: {
      dataset: Dataset;
      sourceId: string;
      memberKey: string;
      dueDate: string;
    },
  ) {
    const principal = await this.access(req, orgId, 'operations.manage'),
      org = await this.reports.organization(orgId);
    const member = (
      await memberDirectory(
        this.reports.workbooks,
        principal,
        body.dataset,
        body.sourceId,
      )
    ).members.find((m) => m.key === body.memberKey);
    if (!member) throw new BadRequestException('Lid niet gevonden.');
    const key = `member:${member.key}:${member.sourceId}`;
    return this.reports.operations.save(
      org,
      principal,
      {
        dataset: body.dataset,
        kind: 'task',
        locationId: member.locationId,
        data: {
          title: `Contact opnemen met ${member.name}`.slice(0, 200),
          description: `Dewi-selectie ${member.asOf}. Laatste bezoek: ${member.lastVisit ?? 'onbekend'}. Dit is een opvolgvoorstel; controleer het dossier.`,
          dueDate: body.dueDate,
          assigneeId: null,
          priority: 'normal',
          status: 'open',
        },
      },
      {
        key,
        source: {
          type: 'member',
          key,
          memberKey: member.key,
          importId: member.sourceId,
        },
      },
    );
  }
  @Post('checklists/generate') async generate(
    @Req() req: FastifyRequest,
    @Param('organizationId') orgId: string,
    @Body() body: { dataset: Dataset },
  ) {
    const principal = await this.access(req, orgId, 'operations.manage');
    return this.reports.operations.generateChecklists(
      await this.reports.organization(orgId),
      principal,
      body.dataset,
    );
  }
  @Post('asset-task') async assetTask(
    @Req() req: FastifyRequest,
    @Param('organizationId') orgId: string,
    @Body()
    body: {
      dataset: Dataset;
      assetId: string;
      requestId: string;
      description: string;
      dueDate: string;
    },
  ) {
    const principal = await this.access(req, orgId, 'operations.manage'),
      org = await this.reports.organization(orgId);
    const asset = (
      await this.reports.operations.list(principal, body.dataset)
    ).find((r) => r.kind === 'asset' && r.id === body.assetId) as
      AssetRecord | undefined;
    if (!asset) throw new BadRequestException('Apparaat niet gevonden.');
    if (!/^[\da-f-]{36}$/i.test(body.requestId))
      throw new BadRequestException('Verzoekcode ontbreekt.');
    const key = `asset:${asset.id}:${body.requestId}`;
    return this.reports.operations.save(
      org,
      principal,
      {
        dataset: body.dataset,
        kind: 'task',
        locationId: asset.locationId,
        data: {
          title: `Onderhoud: ${asset.data.name}`.slice(0, 200),
          description: body.description,
          dueDate: body.dueDate,
          assigneeId: null,
          priority: 'high',
          status: 'open',
        },
      },
      { key, source: { type: 'asset', key, assetId: asset.id } },
    );
  }
}
