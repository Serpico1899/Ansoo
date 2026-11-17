// Persian name normalization. Spec 13.1 (LOCKED).
//
// Two keys:
// - normalizeName: conservative, used for display-adjacent dedup.
// - matchKey: aggressive, used only for candidate retrieval, never auto-merge.

const HARAKAT = /[\u064B-\u0652\u0670]/g;
const TATWEEL = /\u0640/g;
const ZWNJ = /\u200C/g;
const UNICODE_SEPARATORS = /[\p{Zs}\p{Zl}\p{Zp}]/gu;
const WHITESPACE = /\s+/g;
const PERSIAN_OR_ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

function foldDigit(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  return String(code - 0x06F0);
}

export function normalizeName(input: string): string {
  if (typeof input !== "string") {
    throw new TypeError("normalizeName input must be a string");
  }
  return input
    .normalize("NFKC")
    .replace(HARAKAT, "")
    .replace(TATWEEL, "")
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0649/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(PERSIAN_OR_ARABIC_DIGITS, foldDigit)
    .replace(ZWNJ, " ")
    .replace(UNICODE_SEPARATORS, " ")
    .replace(WHITESPACE, " ")
    .trim()
    .toLowerCase();
}

export function matchKey(input: string): string {
  return normalizeName(input)
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u06CC")
    .replace(/\u0621/g, "")
    .replace(/[\p{P}\p{Z}\s]/gu, "");
}
