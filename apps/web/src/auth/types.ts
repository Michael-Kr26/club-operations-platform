export type UserRole = 'admin' | 'manager' | 'employee';

export type RoleAssignment =
  | {
      employeeNumber: string;
      role: 'admin';
    }
  | {
      employeeNumber: string;
      role: 'manager';
      locationSlug: string;
    }
  | {
      employeeNumber: string;
      role: 'employee';
    };
