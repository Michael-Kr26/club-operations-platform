export interface LocalMaintenanceStatus {
  directory: string;
  backups: {
    name: string;
    createdAt: string;
    bytes: number;
    kind: 'manual' | 'automatic';
  }[];
  error: string | null;
}
