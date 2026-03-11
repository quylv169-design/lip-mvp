// app/api/prelearning/generate-quiz/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

type QuizQ = {
  id: string;
  instruction_vi: string;
  instruction_en: string;
  sentence_en: string;
  choices_en: string[];
  answerIndex: number;
  skill_tag: string;
  explain_vi?: string;
  common_mistake_vi?: string;
};

type QuizPayload = { questions: QuizQ[] };

type QuestionBankRow = {
  id: string;
  lesson_id: string;
  question_type: string;
  question_text: string | null;
  instruction_vi: string | null;
  instruction_en: string | null;
  sentence_en: string | null;
  options: unknown;
  answer_index: number | null;
  explanation_vi: string | null;
  skill_tag: string | null;
  difficulty: string | null;
  is_active: boolean | null;
};

const REQUIRED_Q = 7;

function safeStr(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeChoices(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((item) => normalizeSpace(String(item ?? ""))).filter(Boolean);
}

function rowToQuizQuestion(row: QuestionBankRow): QuizQ | null {
  const choices = normalizeChoices(row.options);
  const answerIndex = typeof row.answer_index === "number" ? row.answer_index : -1;

  if (!row.id) return null;
  if (choices.length !== 4) return null;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;

  const sentence = normalizeSpace(row.sentence_en ?? "") || normalizeSpace(row.question_text ?? "");
  if (!sentence) return null;

  return {
    id: row.id,
    instruction_vi: normalizeSpace(row.instruction_vi ?? ""),
    instruction_en: normalizeSpace(row.instruction_en ?? ""),
    sentence_en: sentence,
    choices_en: choices,
    answerIndex,
    skill_tag: normalizeSpace(row.skill_tag ?? "") || "prelearning",
    explain_vi: normalizeSpace(row.explanation_vi ?? "") || undefined,
    common_mistake_vi: undefined,
  };
}

async function resolveLessonId(body: Record<string, unknown>): Promise<string | null> {
  const lessonId = normalizeSpace(safeStr(body.lessonId));
  if (lessonId) return lessonId;

  const lessonTitle = normalizeSpace(safeStr(body.lessonTitle));
  if (!lessonTitle) return null;

  const { data, error } = await supabase
    .from("lessons")
    .select("id")
    .eq("title", lessonTitle)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

async function getPrelearningQuestions(lessonId: string): Promise<QuizPayload> {
  const { data, error } = await supabase
    .from("question_bank")
    .select(
      "id,lesson_id,question_type,question_text,instruction_vi,instruction_en,sentence_en,options,answer_index,explanation_vi,skill_tag,difficulty,is_active"
    )
    .eq("lesson_id", lessonId)
    .eq("question_type", "prelearning")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Load question_bank failed: ${error.message}`);
  }

  const rows = ((data ?? []) as QuestionBankRow[])
    .map((row) => rowToQuizQuestion(row))
    .filter((row): row is QuizQ => row !== null);

  const shuffled = shuffleArray(rows);
  return { questions: shuffled.slice(0, REQUIRED_Q) };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const obj = (body ?? {}) as Record<string, unknown>;

    const lessonId = await resolveLessonId(obj);
    if (!lessonId) {
      return NextResponse.json(
        { error: "Missing lessonId or lessonTitle" },
        { status: 400 }
      );
    }

    const payload = await getPrelearningQuestions(lessonId);

    if (payload.questions.length === 0) {
      return NextResponse.json(
        { error: "No active prelearning questions found for this lesson", questions: [] },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        questions: payload.questions,
        meta: {
          source: "question_bank",
          count: payload.questions.length,
          lessonId,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Internal server error", detail: msg },
      { status: 500 }
    );
  }
}