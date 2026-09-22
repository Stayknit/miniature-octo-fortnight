// Client-safe preset list. Shared by the settings card and the reset flow.
// Two questions are required per account.
export const SECURITY_QUESTION_PRESETS = [
  "What was the name of your first pet?",
  "What town or city were you born in?",
  "What was the name of your primary school?",
  "What is your mother's maiden name?",
  "What was the make of your first car?",
  "What is the name of your favourite place to stay?",
  "What was your childhood nickname?",
  "What is the title of your favourite book?",
] as const

export const SECURITY_QUESTION_COUNT = 2

// Answers are compared case- and whitespace-insensitively so a correct answer
// typed with different casing still matches. Keep this identical on read/write.
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ")
}
