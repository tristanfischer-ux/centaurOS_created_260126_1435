"use server"

import { createClient } from "@/lib/supabase/server"
import { encryptApiKey, decryptApiKey, getKeyHint } from "@/lib/ai-providers/key-vault"
import type { AIProviderId, OutputModality } from "@/lib/ai-providers/types"
import { PROVIDER_REGISTRY } from "@/lib/ai-providers/types"

// ─── Provider Keys ───────────────────────────────────────────────────

export async function saveProviderKey(providerId: AIProviderId, apiKey: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Not authenticated" }
    if (!apiKey || apiKey.trim().length < 10) return { error: "Invalid API key" }
    if (!PROVIDER_REGISTRY[providerId]) return { error: "Unknown provider" }

    const encrypted = encryptApiKey(apiKey.trim())
    const hint = getKeyHint(apiKey.trim())

    const { error } = await supabase
        .from("ai_provider_keys")
        .upsert(
            {
                user_id: user.id,
                provider_id: providerId,
                encrypted_key: encrypted,
                key_hint: hint,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,provider_id" }
        )

    if (error) {
        console.error("[ai-providers] Save key error:", error)
        return { error: "Failed to save API key" }
    }

    return { success: true, hint }
}

export async function deleteProviderKey(providerId: AIProviderId) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Not authenticated" }

    const { error } = await supabase
        .from("ai_provider_keys")
        .delete()
        .eq("user_id", user.id)
        .eq("provider_id", providerId)

    if (error) {
        console.error("[ai-providers] Delete key error:", error)
        return { error: "Failed to delete API key" }
    }

    return { success: true }
}

export async function getProviderKeys(): Promise<{
    keys: Array<{ provider_id: string; key_hint: string; updated_at: string }>
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { keys: [], error: "Not authenticated" }

    const { data, error } = await supabase
        .from("ai_provider_keys")
        .select("provider_id, key_hint, updated_at")
        .eq("user_id", user.id)

    if (error) {
        console.error("[ai-providers] Get keys error:", error)
        return { keys: [], error: "Failed to load keys" }
    }

    return { keys: data ?? [] }
}

/**
 * Server-only: Decrypt a user's API key for a given provider.
 * Used by the execute route, never exposed to the client.
 */
export async function getDecryptedKey(userId: string, providerId: string): Promise<string | null> {
    const supabase = await createClient()

    const { data } = await supabase
        .from("ai_provider_keys")
        .select("encrypted_key")
        .eq("user_id", userId)
        .eq("provider_id", providerId)
        .single()

    if (!data?.encrypted_key) return null

    try {
        return decryptApiKey(data.encrypted_key)
    } catch (err) {
        console.error("[ai-providers] Decrypt error for", providerId, err)
        return null
    }
}

/**
 * Lightweight check: does the user have any API key configured?
 *
 * @description Returns a boolean so the Agents page can show a guidance
 * banner when no keys are set up. No sensitive data is returned.
 *
 * @returns {Promise<boolean>} true if at least one key exists
 */
export async function checkHasAnyProviderKey(): Promise<boolean> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return false

    const { count, error } = await supabase
        .from("ai_provider_keys")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)

    if (error) {
        console.error("[ai-providers] Check key existence error:", error)
        return false
    }

    return (count ?? 0) > 0
}

// ─── Provider Preferences ────────────────────────────────────────────

export async function saveProviderPreference(
    modality: OutputModality,
    providerId: AIProviderId,
    modelId: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Not authenticated" }

    const { error } = await supabase
        .from("ai_provider_preferences")
        .upsert(
            {
                user_id: user.id,
                modality,
                provider_id: providerId,
                model_id: modelId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,modality" }
        )

    if (error) {
        console.error("[ai-providers] Save preference error:", error)
        return { error: "Failed to save preference" }
    }

    return { success: true }
}

export async function getProviderPreferences(): Promise<{
    preferences: Array<{ modality: string; provider_id: string; model_id: string }>
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { preferences: [], error: "Not authenticated" }

    const { data, error } = await supabase
        .from("ai_provider_preferences")
        .select("modality, provider_id, model_id")
        .eq("user_id", user.id)

    if (error) {
        console.error("[ai-providers] Get preferences error:", error)
        return { preferences: [], error: "Failed to load preferences" }
    }

    return { preferences: data ?? [] }
}
