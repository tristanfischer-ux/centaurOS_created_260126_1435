/**
 * Money permission-override capability keys.
 * Runtime constants separated from the 'use server' action file because
 * Next.js 16 rejects non-async exports from "use server" modules.
 */

export type PermissionCapability =
  | 'raise_read'
  | 'raise_write'
  | 'raise_lock'
  | 'raise_send_update'
  | 'plan_read'
  | 'plan_write'
  | 'plan_lock'
  | 'cockpit_read'
  | 'xero_connect'
  | 'xero_disconnect'
  | 'credits_read'
  | 'credits_budget_edit'
  | 'settings_read'
  | 'settings_write'
  | 'permissions_edit'
  | 'audit_read'
  | 'audit_export'

export const PERMISSION_CAPABILITIES: readonly PermissionCapability[] = [
  'raise_read',
  'raise_write',
  'raise_lock',
  'raise_send_update',
  'plan_read',
  'plan_write',
  'plan_lock',
  'cockpit_read',
  'xero_connect',
  'xero_disconnect',
  'credits_read',
  'credits_budget_edit',
  'settings_read',
  'settings_write',
  'permissions_edit',
  'audit_read',
  'audit_export',
] as const
