import { getCadLabRfqTelemetrySummary } from "../activity-events"

const VALID_USER_ID = "550e8400-e29b-41d4-a716-446655440001"
const VALID_FOUNDRY_ID = "550e8400-e29b-41d4-a716-446655440002"

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(),
}

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}))

describe("activity-events Cad Lab RFQ telemetry", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })
  })

  it("returns auth error when user is missing", async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
    })

    const result = await getCadLabRfqTelemetrySummary(VALID_FOUNDRY_ID, 14)
    expect(result).toEqual({ error: "Not authenticated" })
  })

  it("returns authorization error when foundry mismatches", async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { foundry_id: "different-foundry" },
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const result = await getCadLabRfqTelemetrySummary(VALID_FOUNDRY_ID, 7)
    expect(result).toEqual({ error: "Cannot access telemetry for different foundry" })
  })

  it("computes conversion, readiness, and blocker summaries", async () => {
    const activityEvents = [
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_rfq_create_attempt",
          readinessScore: 92,
          quoteReadyModules: 3,
        },
        created_at: "2026-02-01T00:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_rfq_create_attempt",
          readinessScore: 70,
          quoteReadyModules: 1,
        },
        created_at: "2026-02-01T01:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_rfq_create_blocked",
          reason: "missing quote-ready modules",
        },
        created_at: "2026-02-01T02:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_rfq_create_failed",
          reason: "marketplace timeout",
        },
        created_at: "2026-02-01T03:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_rfq_created",
        },
        created_at: "2026-02-01T04:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_package_manifest_downloaded",
        },
        created_at: "2026-02-01T05:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_supplier_packet_downloaded",
        },
        created_at: "2026-02-01T06:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_module_bom_downloaded",
        },
        created_at: "2026-02-01T07:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_rfq_rebroadcast_attempt",
        },
        created_at: "2026-02-01T08:00:00.000Z",
      },
      {
        event_type: "feature_use",
        event_data: {
          feature: "cad_lab_rfq_rebroadcasted",
        },
        created_at: "2026-02-01T09:00:00.000Z",
      },
    ]

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { foundry_id: VALID_FOUNDRY_ID },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "activity_events") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: activityEvents,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const result = await getCadLabRfqTelemetrySummary(VALID_FOUNDRY_ID, 30)
    expect(result.error).toBeUndefined()
    expect(result.summary).toEqual({
      period_days: 30,
      total_events: 10,
      totals: {
        create_attempts: 2,
        create_blocked: 1,
        create_failed: 1,
        created: 1,
        rebroadcast_attempts: 1,
        rebroadcasted: 1,
        manifest_downloads: 1,
        supplier_packet_downloads: 1,
        bom_downloads: 1,
      },
      conversion: {
        attempt_to_created_pct: 50,
        blocked_rate_pct: 50,
        failure_rate_pct: 50,
      },
      readiness: {
        avg_readiness_score_at_attempt: 81,
        avg_quote_ready_modules_at_attempt: 2,
      },
      top_block_reasons: [{ reason: "missing quote-ready modules", count: 1 }],
      top_failure_reasons: [{ reason: "marketplace timeout", count: 1 }],
    })
  })
})
