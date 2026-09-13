import { ka } from "./ka";

export const translations = {
  ka,
} as const;

export type Language = keyof typeof translations;

export const defaultLanguage: Language = "ka";

export function getTranslations(language: Language = defaultLanguage) {
  return translations[language];
}