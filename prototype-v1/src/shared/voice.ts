import { z } from "zod";
import { needSchema } from "./need.ts";

// Both fields are produced from the audio in ONE model request; no STT intermediate.
export const voiceResultSchema = z.strictObject({
  transcript: z.string().max(2000),
  need: needSchema,
});
export type VoiceResult = z.infer<typeof voiceResultSchema>;
