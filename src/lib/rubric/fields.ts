import { fieldDictionary, type CategoryDef, type FieldDef } from "@/lib/template/dictionary";

export interface FieldRef {
  category: CategoryDef;
  field: FieldDef;
  inTable: boolean;
}

const index = new Map<string, FieldRef>();
for (const category of fieldDictionary.categories) {
  for (const field of category.fields) index.set(field.id, { category, field, inTable: false });
  for (const field of category.table?.columns ?? []) index.set(field.id, { category, field, inTable: true });
}

export function findField(fieldId: string): FieldRef | undefined {
  return index.get(fieldId);
}

export function fieldLabel(fieldId: string): string {
  const ref = index.get(fieldId);
  return ref ? `${ref.category.label} › ${ref.field.label}` : "(템플릿에 없는 데이터)";
}

export function fieldIdOf(categoryNo: number, label: string): string {
  const category = fieldDictionary.categories.find((c) => c.no === categoryNo);
  const field = category?.fields.find((f) => f.label === label) ?? category?.table?.columns.find((f) => f.label === label);
  if (!field) throw new Error(`템플릿 사전에 없는 항목: ${categoryNo}번 ${label}`);
  return field.id;
}

export const selectableFields: FieldRef[] = [...index.values()].filter((ref) => !ref.category.excludedFromScoring);
