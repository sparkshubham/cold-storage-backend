import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../config/constants.js';
import { SYSTEM_ROLES } from '../config/roles.js';

describe('RBAC seed map', () => {
  it('includes unique permission keys', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('gives company admin no platform company.create permission', () => {
    const admin = SYSTEM_ROLES.find((r) => r.code === 'company_admin');
    expect(admin?.permissionKeys.includes('company.create')).toBe(false);
    expect(admin?.permissionKeys.includes('customer.create')).toBe(true);
  });

  it('prevents warehouse staff from accessing invoices', () => {
    const staff = SYSTEM_ROLES.find((r) => r.code === 'warehouse_staff');
    expect(staff?.permissionKeys.includes('invoice.view')).toBe(false);
    expect(staff?.permissionKeys.includes('inward.create')).toBe(true);
  });

  it('prevents gate staff from accessing payments', () => {
    const gate = SYSTEM_ROLES.find((r) => r.code === 'gate_staff');
    expect(gate?.permissionKeys.includes('payment.view')).toBe(false);
    expect(gate?.permissionKeys.includes('gate.create')).toBe(true);
  });
});
