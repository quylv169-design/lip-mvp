// app/api/prelearning/evaluate-notebook/route.ts
import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { TRUTH_GROUND } from "@/lib/prelearning/truthGround";

export const runtime = "nodejs";

type NotebookEvalOut = {
  content_score: number; // 0-4
  presentation_score: number; // 0-2
  feedback: string[]; // VN bullets, short, actionable
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(v: any) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const lessonTitle = String(formData.get("lessonTitle") ?? "").trim();
    const lessonId = String(formData.get("lessonId") ?? "").trim();
    const files = formData.getAll("files") as File[];

    if (!lessonTitle) {
      return NextResponse.json({ error: "Missing lessonTitle" }, { status: 400 });
    }
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Missing images" }, { status: 400 });
    }

    const truth: any = (TRUTH_GROUND as any)?.[lessonId];
    const checklistForStudents = typeof truth?.checklistForStudents === "string" ? truth.checklistForStudents.trim() : "";
    const scoringRubric = typeof truth?.scoringRubric === "string" ? truth.scoringRubric.trim() : "";

    // 🚫 Không có truth ground => không chấm theo cảm tính
    if (!checklistForStudents || !scoringRubric) {
      return NextResponse.json(
        {
          error: "Missing truth ground",
          detail: "TRUTH_GROUND[lessonId] must include checklistForStudents and scoringRubric",
          lessonId,
        },
        { status: 422 }
      );
    }

    // MVP: chấm tối đa 2 trang cho nhanh + rẻ
    const pick = files.slice(0, 2);

    const images = await Promise.all(
      pick.map(async (f) => {
        const buf = Buffer.from(await f.arrayBuffer());
        const mime = f.type || "image/jpeg";
        return `data:${mime};base64,${buf.toString("base64")}`;
      })
    );

    const prompt = `
You are grading a student's handwritten notebook for PRE-LEARNING.

IMPORTANT:
- You MUST use the provided "Truth Ground" as the only ground truth.
- Do NOT grade based on vibe, length, or effort alone.
- If the writing is unrelated / random / doodles / off-topic => content_score MUST be 0.
- If handwriting is extremely illegible => presentation_score MUST be 0.

Lesson: ${lessonTitle}
LessonId: ${lessonId}

TRUTH GROUND (must follow):
--- checklistForStudents ---
${checklistForStudents}
--- scoringRubric ---
${scoringRubric}

SCORING (STRICT):
A) content_score (0–4)
- Compare the notebook to checklistForStudents.
- Missing a required part => subtract points.
- If only 0–1 minor pieces present => content_score 1 max.
- If none of the required parts are present => content_score 0.
- "Wrote a lot" does NOT earn points unless it matches checklist content.

B) presentation_score (0–2)
- 2: clear structure (headings / numbering / bullet points), spacing, readable handwriting.
- 1: somewhat readable but messy / weak structure.
- 0: extremely messy OR very hard to read / illegible.

Return JSON ONLY with this exact schema (no extra keys):
{
  "content_score": number,
  "presentation_score": number,
  "feedback": ["VN bullet points, cực ngắn, actionable (3–7 bullets)"]
}

Feedback rules:
- Vietnamese only.
- Must mention what is MISSING compared to checklist (if any).
- Must mention 1 presentation improvement (if any).
`.trim();

    const content: any[] = [
      { type: "text", text: prompt },
      ...images.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a strict, rubric-driven grader. You follow the Truth Ground exactly. Output valid JSON only.",
        },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON", raw }, { status: 500 });
    }

    // Normalize + clamp hard
    const out: NotebookEvalOut = {
      content_score: clamp(toNum(parsed?.content_score, 0), 0, 4),
      presentation_score: clamp(toNum(parsed?.presentation_score, 0), 0, 2),
      feedback: toStringArray(parsed?.feedback).slice(0, 12),
    };

    // Extra hard guard: if model returns empty feedback, provide a minimal fallback
    if (!out.feedback.length) {
      out.feedback = ["- Thiếu phản hồi từ AI. Hãy chụp rõ hơn và viết đúng checklist."];
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal server error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}