// Server-only schemas. Never import this module from the client:
// the client bundle must not even contain the secret field names.
import { z } from "zod";

export const LotObjectSecretSchema = z.object({
  silhouetteId: z.string(),
  name: z.string(),
  trueValue: z.number().int().nonnegative(),
  category: z.string(),
});
export type LotObjectSecret = z.infer<typeof LotObjectSecretSchema>;

export const LotSecretSchema = z.object({
  id: z.string(),
  round: z.number().int().positive(),
  objects: z.array(LotObjectSecretSchema),
  trueTotal: z.number().int().nonnegative(),
});
export type LotSecret = z.infer<typeof LotSecretSchema>;