/** Country entry for the bank picker. */
export interface Country {
  code: string;
  label: string;
}

/** Countries covered by Enable Banking that the picker offers. */
export const COUNTRIES: Country[] = [
  { code: "IT", label: "Italy" },
  { code: "FI", label: "Finland" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "NL", label: "Netherlands" },
  { code: "SE", label: "Sweden" },
  { code: "DK", label: "Denmark" },
  { code: "NO", label: "Norway" },
  { code: "EE", label: "Estonia" },
  { code: "LT", label: "Lithuania" },
  { code: "LV", label: "Latvia" },
  { code: "IS", label: "Iceland" },
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Belgium" },
  { code: "PT", label: "Portugal" },
  { code: "RO", label: "Romania" },
  { code: "HU", label: "Hungary" },
  { code: "SK", label: "Slovakia" },
];

/**
 * Picks the initial country from the browser locale, falling back to Italy.
 *
 * @returns An ISO 3166-1 alpha-2 country code from {@link COUNTRIES}.
 */
export function defaultCountry(): string {
  const locale = navigator.language.split("-")[1]?.toUpperCase();
  return COUNTRIES.some((country) => country.code === locale) ? (locale ?? "IT") : "IT";
}
