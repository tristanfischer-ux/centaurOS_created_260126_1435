#!/usr/bin/env bash

set -euo pipefail

readonly SECURITY_MIGRATIONS=(
  "20260214120000_restore_profiles_rls_with_membership_guard"
  "20260214123000_secure_message_files_bucket"
  "20260214130000_secure_message_attachments_bucket"
  "20260214134000_tighten_legacy_message_attachment_policies"
)

function print_usage() {
  echo "Usage: $0 [--generate-types] [--project-ref <ref>]"
  echo
  echo "Deploys security-critical Supabase migrations to the linked project and"
  echo "verifies the expected migration versions are present remotely."
  echo
  echo "Required environment variables:"
  echo "  SUPABASE_ACCESS_TOKEN   Supabase personal access token (sbp_...)"
  echo "  SUPABASE_DB_PASSWORD    Remote database password"
  echo
  echo "Optional environment variables:"
  echo "  SUPABASE_PROJECT_REF    Supabase project ref (falls back to supabase/.temp/project-ref)"
}

function require_env_var() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    echo "[security-migrations] Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
}

GENERATE_TYPES=false
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --generate-types)
      GENERATE_TYPES=true
      shift
      ;;
    --project-ref)
      PROJECT_REF="$2"
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_usage
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_REF" ]]; then
  if [[ -f "supabase/.temp/project-ref" ]]; then
    PROJECT_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
  fi
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "[security-migrations] Unable to resolve Supabase project ref." >&2
  print_usage
  exit 1
fi

require_env_var "SUPABASE_ACCESS_TOKEN"
require_env_var "SUPABASE_DB_PASSWORD"

if [[ ! "${SUPABASE_ACCESS_TOKEN}" =~ ^sbp_ ]]; then
  echo "[security-migrations] SUPABASE_ACCESS_TOKEN must be a personal access token (sbp_...)." >&2
  exit 1
fi

echo "[security-migrations] Linking project ${PROJECT_REF}..."
npx supabase link --project-ref "${PROJECT_REF}" --password "${SUPABASE_DB_PASSWORD}"

echo "[security-migrations] Applying pending migrations..."
npx supabase db push --linked --include-all --password "${SUPABASE_DB_PASSWORD}"

echo "[security-migrations] Verifying security migrations are applied remotely..."
MIGRATION_LIST_JSON="$(npx supabase migration list --linked --password "${SUPABASE_DB_PASSWORD}" --output json)"

MIGRATION_LIST_JSON="$MIGRATION_LIST_JSON" node - "${SECURITY_MIGRATIONS[@]}" <<'NODE'
const raw = process.env.MIGRATION_LIST_JSON ?? ''
const required = process.argv.slice(2)

let parsed
try {
  parsed = JSON.parse(raw)
} catch (error) {
  console.error('[security-migrations] Failed to parse migration list JSON:', error)
  process.exit(1)
}

const rows = Array.isArray(parsed)
  ? parsed
  : Array.isArray(parsed?.migrations)
    ? parsed.migrations
    : []

const remoteVersions = new Set(
  rows
    .map((row) => String(row?.remote ?? '').trim())
    .filter((version) => version.length > 0)
)

const missing = required.filter((version) => !remoteVersions.has(version))
if (missing.length > 0) {
  console.error('[security-migrations] Missing expected remote migration versions:', missing.join(', '))
  process.exit(1)
}

console.log('[security-migrations] Verified remote migration versions:', required.join(', '))
NODE

if [[ "$GENERATE_TYPES" == "true" ]]; then
  echo "[security-migrations] Regenerating database types..."
  npx supabase gen types typescript --linked > src/types/database.types.ts
  echo "[security-migrations] Running focused security typecheck..."
  npx tsc --noEmit -p tsconfig.security.json
fi

echo "[security-migrations] Security migration deployment completed."
