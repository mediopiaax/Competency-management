import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { CompetencyInput } from "@/lib/competency/parse-list";
import type { QualJudgment } from "@/lib/rubric/engine";
import type { Rubric } from "@/lib/rubric/types";
import type { ParsedStudent } from "@/lib/template/parse";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS competency_list (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rubric (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, family_id TEXT NOT NULL, list_id TEXT, name TEXT NOT NULL,
  status TEXT NOT NULL, version TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, confirmed_at TEXT);
CREATE TABLE IF NOT EXISTS submission (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_key TEXT NOT NULL, file_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(workspace_id, student_key));
CREATE TABLE IF NOT EXISTS evaluation_run (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, rubric_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS qual_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
`;

const holder = globalThis as unknown as { __competencyDb?: DatabaseSync };
function db(): DatabaseSync {
  if (!holder.__competencyDb) {
    const file = process.env.DB_FILE ?? path.join(process.cwd(), "data", "app.db");
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    holder.__competencyDb = new DatabaseSync(file);
    holder.__competencyDb.exec(SCHEMA);
  }
  return holder.__competencyDb;
}
const now = () => new Date().toISOString();
type Row = Record<string, string | number | null>;
const all = (sql: string, ...params: (string | number | null)[]) => db().prepare(sql).all(...params) as Row[];
const one = (sql: string, ...params: (string | number | null)[]) => db().prepare(sql).get(...params) as Row | undefined;
const run = (sql: string, ...params: (string | number | null)[]) => db().prepare(sql).run(...params);

export type WorkspaceKind = "institution" | "student";
export interface Workspace { id: string; kind: WorkspaceKind; name: string; createdAt: string }
const toWorkspace = (r: Row): Workspace => ({ id: r.id as string, kind: r.kind as WorkspaceKind, name: r.name as string, createdAt: r.created_at as string });

export const workspaces = {
  list: () => all("SELECT * FROM workspace ORDER BY created_at").map(toWorkspace),
  get: (id: string) => { const r = one("SELECT * FROM workspace WHERE id = ?", id); return r ? toWorkspace(r) : null; },
  create(kind: WorkspaceKind, name: string) {
    const ws: Workspace = { id: randomUUID(), kind, name, createdAt: now() };
    run("INSERT INTO workspace VALUES (?, ?, ?, ?)", ws.id, ws.kind, ws.name, ws.createdAt);
    return ws;
  },
};

export function audit(workspaceId: string, action: string, detail: string) {
  run("INSERT INTO audit_log (workspace_id, at, action, detail) VALUES (?, ?, ?, ?)", workspaceId, now(), action, detail);
}
export const auditLog = (workspaceId: string) =>
  all("SELECT at, action, detail FROM audit_log WHERE workspace_id = ? ORDER BY id DESC LIMIT 200", workspaceId) as unknown as { at: string; action: string; detail: string }[];

export interface CompetencyList { id: string; name: string; competencies: CompetencyInput[]; createdAt: string }
const toList = (r: Row): CompetencyList => ({ id: r.id as string, name: r.name as string, competencies: JSON.parse(r.body as string), createdAt: r.created_at as string });
export const lists = {
  list: (ws: string) => all("SELECT * FROM competency_list WHERE workspace_id = ? ORDER BY created_at DESC", ws).map(toList),
  get: (ws: string, id: string) => { const r = one("SELECT * FROM competency_list WHERE workspace_id = ? AND id = ?", ws, id); return r ? toList(r) : null; },
  create(ws: string, name: string, competencies: CompetencyInput[]) {
    const id = randomUUID();
    run("INSERT INTO competency_list VALUES (?, ?, ?, ?, ?)", id, ws, name, JSON.stringify(competencies), now());
    audit(ws, "역량 목록 등록", `${name} (역량 ${competencies.length}개)`);
    return id;
  },
};

export interface RubricRecord {
  id: string; familyId: string; listId: string | null; name: string; status: "draft" | "confirmed"; version: string | null;
  body: Rubric; createdAt: string; updatedAt: string; confirmedAt: string | null;
}
const toRubric = (r: Row): RubricRecord => ({
  id: r.id as string, familyId: r.family_id as string, listId: r.list_id as string | null, name: r.name as string, status: r.status as RubricRecord["status"],
  version: r.version as string | null, body: JSON.parse(r.body as string), createdAt: r.created_at as string, updatedAt: r.updated_at as string, confirmedAt: r.confirmed_at as string | null,
});
export const rubrics = {
  list: (ws: string) => all("SELECT * FROM rubric WHERE workspace_id = ? ORDER BY updated_at DESC", ws).map(toRubric),
  get: (ws: string, id: string) => { const r = one("SELECT * FROM rubric WHERE workspace_id = ? AND id = ?", ws, id); return r ? toRubric(r) : null; },
  createDraft(ws: string, body: Rubric, listId: string | null, familyId?: string) {
    const id = randomUUID();
    const t = now();
    run("INSERT INTO rubric VALUES (?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, NULL)", id, ws, familyId ?? id, listId, body.name, JSON.stringify(body), t, t);
    audit(ws, "채점기준표 초안 생성", `${body.name} (${body.generatedBy === "ai" ? "AI" : body.generatedBy === "rules" ? "규칙 기반" : "직접 작성"})`);
    return id;
  },
  saveDraft(ws: string, id: string, body: Rubric) {
    const result = run("UPDATE rubric SET body = ?, name = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND status = 'draft'", JSON.stringify(body), body.name, now(), ws, id);
    if (result.changes > 0) audit(ws, "채점기준표 수정", body.name);
    return result.changes > 0;
  },
  confirm(ws: string, id: string) {
    const record = rubrics.get(ws, id);
    if (!record || record.status !== "draft") return null;
    const count = one("SELECT COUNT(*) AS n FROM rubric WHERE workspace_id = ? AND family_id = ? AND status = 'confirmed'", ws, record.familyId)!.n as number;
    const version = `v1.${count}`;
    const t = now();
    run("UPDATE rubric SET status = 'confirmed', version = ?, confirmed_at = ?, updated_at = ? WHERE id = ?", version, t, t, id);
    audit(ws, "채점기준표 확정", `${record.name} ${version}`);
    return version;
  },
  fork(ws: string, id: string) {
    const record = rubrics.get(ws, id);
    if (!record) return null;
    return rubrics.createDraft(ws, { ...record.body, generatedBy: "manual" }, record.listId, record.familyId);
  },
};

export interface Submission { id: string; fileName: string; student: ParsedStudent; createdAt: string }
const toSubmission = (r: Row): Submission => ({ id: r.id as string, fileName: r.file_name as string, student: JSON.parse(r.body as string), createdAt: r.created_at as string });
export const submissions = {
  list: (ws: string) => all("SELECT * FROM submission WHERE workspace_id = ? ORDER BY created_at, student_key", ws).map(toSubmission),
  upsert(ws: string, fileName: string, student: ParsedStudent) {
    const key = student.studentId ?? student.sheetName;
    const existing = one("SELECT id FROM submission WHERE workspace_id = ? AND student_key = ?", ws, key);
    const id = (existing?.id as string) ?? randomUUID();
    run("INSERT OR REPLACE INTO submission VALUES (?, ?, ?, ?, ?, ?)", id, ws, key, fileName, JSON.stringify(student), now());
    return id;
  },
  remove(ws: string, id: string) { run("DELETE FROM submission WHERE workspace_id = ? AND id = ?", ws, id); },
  clear(ws: string) { run("DELETE FROM submission WHERE workspace_id = ?", ws); },
};

export const runs = {
  list: (ws: string) => all("SELECT id, rubric_id, created_at, body FROM evaluation_run WHERE workspace_id = ? ORDER BY created_at DESC", ws).map((r) => {
    const body = JSON.parse(r.body as string);
    return { id: r.id as string, createdAt: r.created_at as string, rubricName: body.rubric.name as string, version: body.rubric.version as string, students: body.students.length as number };
  }),
  get: (ws: string, id: string) => { const r = one("SELECT body FROM evaluation_run WHERE workspace_id = ? AND id = ?", ws, id); return r ? JSON.parse(r.body as string) : null; },
  create(ws: string, rubricId: string, body: unknown) {
    const id = randomUUID();
    run("INSERT INTO evaluation_run VALUES (?, ?, ?, ?, ?)", id, ws, rubricId, JSON.stringify(body), now());
    return id;
  },
};

export const qualCache = {
  get(key: string): QualJudgment | null { const r = one("SELECT body FROM qual_cache WHERE key = ?", key); return r ? JSON.parse(r.body as string) : null; },
  set(key: string, value: QualJudgment) { run("INSERT OR REPLACE INTO qual_cache VALUES (?, ?, ?)", key, JSON.stringify(value), now()); },
};
