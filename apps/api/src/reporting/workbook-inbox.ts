import { constants } from 'node:fs';
import { mkdir, open, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Dataset,
  Principal,
  ReportOrganization,
  WorkbookInboxStatus,
} from '@cop/contracts';
import type { WorkbookImports } from './workbook-imports.js';

type Body = Parameters<WorkbookImports['import']>[2];
export class WorkbookInbox {
  private states = new Map<string, WorkbookInboxStatus>();
  private seen = new Map<string, string>();
  private running = new Set<string>();
  constructor(
    private directory: string,
    private imports: WorkbookImports,
    readonly available = process.env.COP_STORAGE_MODE === 'pglite-local' &&
      process.env.HOST === '127.0.0.1' &&
      process.env.NODE_ENV !== 'production',
  ) {}
  path(org: string, dataset: Dataset) {
    return join(this.directory, 'inbox', encodeURIComponent(org), dataset);
  }
  status(org: string, dataset: Dataset, enabled: boolean): WorkbookInboxStatus {
    return {
      ...(this.states.get(org + '/' + dataset) ?? {
        lastScan: null,
        error: null,
        files: [],
      }),
      available: this.available,
      enabled,
      path: this.available ? this.path(org, dataset) : null,
    };
  }
  async enable(org: string, dataset: Dataset) {
    if (!this.available)
      throw new Error(
        'Mapimport is alleen beschikbaar in de Dockerloze lokale COP-start.',
      );
    await mkdir(this.path(org, dataset), { recursive: true, mode: 0o700 });
  }
  private async readRegular(path: string, max: number) {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > max)
      throw new Error('Ongeldig bronbestand.');
    const handle = await open(
      path,
      constants.O_RDONLY |
        (process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0)),
    );
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size > max)
        throw new Error('Ongeldig bestand of bestand te groot.');
      const bytes = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const result = await handle.read(
          bytes,
          length,
          bytes.length - length,
          length,
        );
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      const after = await handle.stat();
      if (
        length !== before.size ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs
      )
        throw new Error('Bestand wordt nog geschreven.');
      return bytes.subarray(0, length);
    } finally {
      await handle.close();
    }
  }
  async scan(org: ReportOrganization, dataset: Dataset, now = new Date()) {
    const key = org.id + '/' + dataset;
    if (this.running.has(key)) return;
    this.running.add(key);
    try {
      await this.scanFiles(org, dataset, now);
    } finally {
      this.running.delete(key);
    }
  }
  private async scanFiles(
    org: ReportOrganization,
    dataset: Dataset,
    now: Date,
  ) {
    if (!this.available) return;
    const preferences = await this.imports.preferences.read(org.id, dataset);
    if (!preferences.inboxEnabled) return;
    const key = org.id + '/' + dataset,
      path = this.path(org.id, dataset);
    const state = this.status(org.id, dataset, true);
    state.lastScan = now.toISOString();
    state.error = null;
    try {
      await this.enable(org.id, dataset);
      const files = (await readdir(path, { withFileTypes: true })).filter(
        (f) =>
          f.isFile() &&
          !f.isSymbolicLink() &&
          /\.(zip|xlsx|eml)$/i.test(f.name),
      );
      if (files.length > 500)
        throw new Error(
          'Te veel bestanden. Houd maximaal 500 bronbestanden in de importmap.',
        );
      let processed = 0;
      for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
        const filename = file.name,
          full = join(path, filename),
          stat = await lstat(full);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          now.getTime() - stat.mtimeMs < 3000
        )
          continue;
        const sidecar = full + '.cop.json';
        let metadataStamp = 'none';
        try {
          const meta = await lstat(sidecar);
          if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 16000) {
            metadataStamp = 'invalid';
          } else {
            if (now.getTime() - meta.mtimeMs < 3000) continue;
            metadataStamp = meta.mtimeMs + ':' + meta.size;
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        const signature = JSON.stringify([
          stat.size,
          stat.mtimeMs,
          metadataStamp,
          preferences.mappings,
        ]);
        if (this.seen.get(full) === signature) continue;
        if (processed++ >= 3) break;
        let status = 'rejected',
          message =
            'Bestand of aanvullende importgegevens niet leesbaar/verwerkbaar.';
        try {
          if (metadataStamp === 'invalid')
            throw new Error('Ongeldige aanvullende gegevens.');
          const metadata: Partial<Body> =
            metadataStamp === 'none'
              ? {}
              : JSON.parse(
                  (await this.readRegular(sidecar, 16000)).toString('utf8'),
                );
          if (
            !metadata ||
            typeof metadata !== 'object' ||
            Array.isArray(metadata)
          )
            throw new Error('Ongeldige aanvullende gegevens.');
          const bytes = await this.readRegular(
            full,
            /\.zip$/i.test(filename) ? 20_000_000 : 5_000_000,
          );
          const body: Body = {
            ...metadata,
            filename,
            dataset,
            content: bytes.toString('base64'),
            rememberMapping: false,
          };
          const preview = await this.imports.preview(org, body);
          const contexts = { ...body.fileContexts };
          for (const entry of preview) {
            if (entry.kind !== 'members' && entry.kind !== 'finance') continue;
            const explicit =
              contexts[entry.filename]?.scopeConfirmed === true ||
              body.scopeConfirmed === true;
            // Enabling the inbox permits reusing previously confirmed proposals
            // of the same format. Dates still require explicit local metadata.
            if (entry.locationId && (entry.suggested || explicit))
              contexts[entry.filename] = {
                locationId: entry.locationId ?? undefined,
                asOf: entry.asOf ?? undefined,
                scopeConfirmed: true,
              };
          }
          body.fileContexts = contexts;
          const principal: Principal = {
            userId: 'local-inbox',
            organizationId: org.id,
            locations: null,
            permissions: ['reports.manage'],
          };
          if (/\.zip$/i.test(filename)) {
            const result = await this.imports.importZip(org, principal, body);
            status = result.results.every((r) => r.status === 'accepted')
              ? 'accepted'
              : result.results.some((r) => r.status === 'accepted')
                ? 'partial'
                : 'rejected';
            message =
              result.summary +
              ' ' +
              result.results
                .filter((r) => r.status === 'rejected')
                .map((r) => `${r.filename}: ${r.error}`)
                .join(' ');
          } else {
            const result = await this.imports.import(org, principal, {
              ...body,
              ...contexts[filename],
            });
            status = result.status;
            message =
              result.error ??
              (result.duplicate
                ? 'Al verwerkt; geen dubbeltelling.'
                : 'Verwerkt.');
          }
        } catch {
          /* Keep private file contents and filesystem errors out of logs. */
        }
        this.seen.set(full, signature);
        state.files = [
          { filename, status, message },
          ...state.files.filter((r) => r.filename !== filename),
        ].slice(0, 100);
      }
    } catch {
      state.error =
        'Importmap niet leesbaar of te veel bestanden. Controleer de map en bestandsrechten.';
    }
    this.states.set(key, state);
  }
}
