import type { OperationsWorkspace } from '@cop/contracts';
import { today } from './api';
// Synthetic data for component tests, never loaded by the application.
export function workspaceFixture(): OperationsWorkspace {
  return {
    organization: {
      id: 'sport-society',
      name: 'Sport Society',
      locations: [
        { id: 'achterveld', name: 'Achterveld' },
        { id: 'barneveld', name: 'Barneveld' },
        { id: 'wekerom', name: 'Wekerom' },
        { id: 'harskamp', name: 'Harskamp' },
        { id: 'voorthuizen', name: 'Voorthuizen' },
      ],
    },
    principal: {
      organizationId: 'sport-society',
      userId: 'fixture',
      locations: null,
      permissions: [
        'reports.read',
        'reports.manage',
        'operations.read',
        'operations.manage',
        'members.read',
      ],
    },
    dataset: 'real',
    tasks: [],
    employees: [],
    shifts: [
      {
        id: 'shift1',
        kind: 'shift',
        locationId: 'achterveld',
        dataset: 'real',
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        updatedBy: 'fixture',
        data: {
          employeeId: null,
          date: today(),
          start: '16:00',
          end: '21:30',
          activity: 'floor',
          status: 'draft',
          notes: '',
        },
      },
      {
        id: 'shift2',
        kind: 'shift',
        locationId: 'barneveld',
        dataset: 'real',
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        updatedBy: 'fixture',
        data: {
          employeeId: null,
          date: today(),
          start: '07:00',
          end: '13:00',
          activity: 'floor',
          status: 'draft',
          notes: '',
        },
      },
    ],
    checklists: [],
    assets: [],
    reports: null,
    warnings: ['Bezettingsnormen zijn nog niet ingesteld.'],
  };
}
