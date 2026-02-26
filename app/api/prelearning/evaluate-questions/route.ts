// app/api/prelearning/evaluate-questions/route.ts
import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

type EvalQuestionsResponse = {
  questions_score: number; // 0-2
  feedback?: string[];
  notes?: string[];
  rewrite_suggestions?: string[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;

    const lessonTitle =
      typeof (body as any)?.lessonTitle === "string" ? String((body as any).lessonTitle).trim() : "";

    const questionsRaw = (body as any)?.questions;

    const questions: string[] = Array.isArray(questionsRaw)
      ? (questionsRaw as unknown[])
          .map((q: unknown) => (typeof q === "string" ? q.trim() : ""))
          .filter((q: string) => q.length > 0)
      : [];

    if (!lessonTitle) {
      return NextResponse.json({ error: "Missing lessonTitle" }, { status: 400 });
    }
    if (questions.length < 3) {
      return NextResponse.json({ error: "Need at least 3 questions" }, { status: 400 });
    }

    const prompt = `
Lesson: ${lessonTitle}

You are evaluating student's questions for PRE-LEARNING.

Score strictly:
- questions_score (0–2)
  0: off-topic / quá chung chung / không thể giúp tutor dạy đúng chỗ
  1: có liên quan nhưng còn mơ hồ, thiếu cụ thể
  2: cụ thể, đúng trọng tâm, giúp tutor biết học sinh đang vướng gì

Return JSON only:
{
  "questions_score": number,
  "feedback": ["VN bullet points, cực ngắn, actionable"],
  "notes": ["VN bullet points nếu cần"],
  "rewrite_suggestions": ["Gợi ý viết lại 1-2 câu hỏi thành cụ thể hơn (VN)"]
}
`.trim();

    const content = [
      { type: "text" as const, text: prompt },
      {
        type: "text" as const,
        text: `Student questions:\n${questions.map((q: string, i: number) => `${i + 1}) ${q}`).join("\n")}`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a strict ESL tutor. Be concise and fair." },
        { role: "user", content: content as any },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: EvalQuestionsResponse;
    try {
      parsed = JSON.parse(raw) as EvalQuestionsResponse;
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON", raw }, { status: 500 });
    }

    // normalize output (avoid NaN)
    const out: EvalQuestionsResponse = {
      questions_score: Number(parsed?.questions_score ?? 0),
      feedback: Array.isArray(parsed?.feedback) ? parsed.feedback.map((s) => String(s)) : undefined,
      notes: Array.isArray(parsed?.notes) ? parsed.notes.map((s) => String(s)) : undefined,
      rewrite_suggestions: Array.isArray(parsed?.rewrite_suggestions)
        ? parsed.rewrite_suggestions.map((s) => String(s))
        : undefined,
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal server error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}