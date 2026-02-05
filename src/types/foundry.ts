/**
 * @file foundry.ts
 * 
 * @description Types related to foundry (company) data including purpose, mission, and vision.
 */

/**
 * Questionnaire responses used to generate purpose statement
 */
export interface PurposeQuestionnaire {
  /** Why does your company exist? Core reason for existence. */
  whyExists: string
  /** What problem are you solving? */
  problemSolved: string
  /** Who do you serve? Target audience. */
  whoServed: string
  /** What makes your approach unique? */
  uniqueValue: string
  /** What does success look like in 5 years? */
  fiveYearVision: string
}

/**
 * Foundry purpose data stored in foundries.purpose_data JSONB column
 */
export interface FoundryPurposeData {
  // Synthesized statements (displayed to users)
  /** The core "why" - 1-2 sentences explaining why the company exists */
  purpose: string
  /** What we do and for whom */
  mission: string | null
  /** Where we're headed (future state) */
  vision: string | null
  
  // Questionnaire responses (used to generate above)
  /** Raw questionnaire responses */
  questionnaire: PurposeQuestionnaire | null
  
  // Metadata
  /** ISO timestamp of last update */
  updatedAt: string
  /** User ID who last edited */
  updatedBy: string
}

/**
 * Partial update type for foundry purpose (used in server actions)
 */
export type UpdateFoundryPurposeData = Partial<Omit<FoundryPurposeData, 'updatedAt' | 'updatedBy'>>
