import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import type {
  LocalWorkbookFileStatus,
  Principal,
  ReportOrganization,
} from '@cop/contracts';
import type { WorkbookImports } from './workbook-imports.js';

export class LocalWorkbookFile {
  private running = false;
  private checked = 0;
  private hash = '';
  private lastRejected: string | null = null;
  private state: LocalWorkbookFileStatus;
  constructor(
    private imports: WorkbookImports,
    private options: {
      available: boolean;
      path: string;
      organizationId: string;
    },
  ) {
    this.state = {
      enabled: !!(options.available && options.path),
      path: options.available ? options.path || null : null,
      lastCheckedAt: null,
      lastImportedAt: null,
      status: 'pending',
      message: 'Het vaste bronbestand is nog niet gecontroleerd.',
    };
  }
  status(org: string) {
    return org === this.options.organizationId && this.state.enabled
      ? { ...this.state }
      : undefined;
  }
  async scan(org: ReportOrganization, now = new Date(), force = false) {
    if (
      !this.status(org.id) ||
      this.running ||
      (!force && this.checked && now.getTime() - this.checked < 60000)
    )
      return;
    this.running = true;
    this.checked = now.getTime();
    this.state.lastCheckedAt = now.toISOString();
    try {
      const path = this.options.path;
      if (!isAbsolute(path) || !/\.xlsx$/i.test(path)) throw new Error('path');
      const entry = await lstat(path);
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        entry.size < 1 ||
        entry.size > 5000000
      )
        throw new Error('size');
      if (now.getTime() - entry.mtimeMs < 3000) {
        this.state.status = 'waiting';
        this.state.message =
          'Bestand is zojuist gewijzigd; COP probeert het bij de volgende controle opnieuw.';
        return;
      }
      const file = await open(
        path,
        constants.O_RDONLY |
          (process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0)),
      );
      let bytes: Buffer;
      try {
        const before = await file.stat();
        if (
          !before.isFile() ||
          before.size !== entry.size ||
          before.mtimeMs !== entry.mtimeMs
        )
          throw new Error('changing');
        bytes = Buffer.alloc(before.size + 1);
        let length = 0;
        while (length < bytes.length) {
          const read = await file.read(
            bytes,
            length,
            bytes.length - length,
            length,
          );
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        const after = await file.stat();
        if (
          length !== before.size ||
          before.mtimeMs !== after.mtimeMs ||
          before.size !== after.size
        )
          throw new Error('changing');
        bytes = bytes.subarray(0, length);
      } finally {
        await file.close();
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash === this.hash && !force) {
        this.state.status = this.lastRejected ? 'rejected' : 'unchanged';
        this.state.message =
          this.lastRejected ??
          'Bestand ongewijzigd; eerder geïmporteerde gegevens blijven beschikbaar.';
        return;
      }
      const principal: Principal = {
        userId: 'local-healthplanner-file',
        organizationId: org.id,
        locations: null,
        permissions: ['reports.read', 'reports.manage'],
      };
      const result = await this.imports.import(org, principal, {
        dataset: 'real',
        filename: basename(path),
        content: bytes.toString('base64'),
        expectedKind: 'healthplanner',
      });
      this.hash = hash;
      if (result.status !== 'accepted') {
        this.state.status = 'rejected';
        this.state.message =
          result.error ??
          'Dit bestand is geen geldige Healthplanner-updatetabel.';
        this.lastRejected = this.state.message;
        return;
      }
      this.lastRejected = null;
      this.state.lastImportedAt =
        (await this.imports.list(principal, 'real')).find(
          (item) => item.id === result.id,
        )?.importedAt ?? null;
      this.state.status = result.duplicate ? 'unchanged' : 'imported';
      this.state.message = result.duplicate
        ? 'Dit bestand is al verwerkt; geen dubbele import.'
        : 'Healthplanner-bestand geïmporteerd. De bronperioden uit het bestand zijn gebruikt.';
    } catch (error) {
      this.state.status = 'error';
      const code = (error as NodeJS.ErrnoException).code;
      this.state.message =
        code === 'ENOENT'
          ? 'Bronbestand niet gevonden. Controleer het pad en of OneDrive dit bestand op dit apparaat beschikbaar heeft.'
          : error instanceof Error && error.message === 'size'
            ? 'Gebruik een regulier XLSX-bestand van maximaal 5 MB.'
            : 'Bronbestand tijdelijk niet leesbaar of in gebruik. Controleer OneDrive, Excel en bestandsrechten. Eerdere gegevens blijven beschikbaar.';
    } finally {
      this.running = false;
    }
  }
}
