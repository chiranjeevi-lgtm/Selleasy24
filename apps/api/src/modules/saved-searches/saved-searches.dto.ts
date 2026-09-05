import { z } from 'zod';

/**
 * Create a saved search — a named snapshot of a search URL the buyer
 * wants to revisit later (or eventually receive alerts against).
 *
 * `queryString` is stored as-is from the URL (`?bedrooms=3&maxPrice=...`)
 * so the search API's parameter set can evolve without a schema change.
 * We cap at 2000 chars — a legitimate search URL never approaches that,
 * but a caller pasting arbitrary data shouldn't be able to write pages
 * of text into the row.
 */
export const createSavedSearchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  queryString: z
    .string()
    .trim()
    .min(1, 'Empty search — nothing to save')
    .max(2000, 'Search parameters look too long — check for stray text'),
  alertsEnabled: z.boolean().default(false),
});

export type CreateSavedSearchDto = z.infer<typeof createSavedSearchSchema>;

export const toggleAlertsSchema = z.object({
  alertsEnabled: z.boolean(),
});

export type ToggleAlertsDto = z.infer<typeof toggleAlertsSchema>;
