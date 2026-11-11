/**
 * Joins conditional class names.
 *
 * @param classes - Class names, with falsy values ignored.
 * @returns A single space-separated class string.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
