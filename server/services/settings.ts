/** Lecture et écriture des réglages (app_setting), toujours validés par leur schéma. */
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { SETTINGS, type SettingKey } from "../../shared/settings.js";
import { getDb, schema } from "../db/index.js";

export async function readSetting<K extends SettingKey>(key: K): Promise<z.output<(typeof SETTINGS)[K]>> {
  const db = await getDb();
  const [row] = await db.select().from(schema.appSetting).where(eq(schema.appSetting.key, key));
  // Valeur absente ou ancienne : le schéma complète avec ses valeurs par défaut.
  const parsed = SETTINGS[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : SETTINGS[key].parse({})) as z.output<(typeof SETTINGS)[K]>;
}

export async function writeSetting<K extends SettingKey>(key: K, value: unknown): Promise<z.output<(typeof SETTINGS)[K]>> {
  const db = await getDb();
  const data = SETTINGS[key].parse(value) as z.output<(typeof SETTINGS)[K]>;
  await db
    .insert(schema.appSetting)
    .values({ key, value: data })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value: data, updatedAt: new Date() } });
  return data;
}
