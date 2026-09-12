import type { AppLanguage } from "@/lib/language";
import { bn } from "./locales/bn";
import { en } from "./locales/en";
import { hi } from "./locales/hi";
import { ta } from "./locales/ta";
import { te } from "./locales/te";
import { ur } from "./locales/ur";
import type { TranslationTree } from "./types";

export const LOCALE_PACKS: Record<AppLanguage, TranslationTree> = {
  bn,
  en,
  hi,
  ur,
  ta,
  te,
};

export function flattenKeys(tree: TranslationTree, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(path);
    } else {
      keys.push(...flattenKeys(value, path));
    }
  }
  return keys;
}

export function getCanonicalEnglishKeys(): string[] {
  return flattenKeys(en).sort();
}

export function resolveTreeValue(tree: TranslationTree, keyPath: string): string | undefined {
  const parts = keyPath.split(".");
  let node: string | TranslationTree | undefined = tree;
  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}
