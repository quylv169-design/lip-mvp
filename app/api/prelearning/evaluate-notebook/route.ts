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
  return v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Resolve Truth Ground in this priority:
 * 1) From client formData: requiredNotes / checklistForStudents, scoringRubric
 * 2) TRUTH_GROUND[lessonId]
 * 3) Fuzzy match by lessonTitle inside TRUTH_GROUND values (title/lessonTitle)
 */
function resolveTruthGround(opts: {
  lessonId: string;
  lessonTitle: string;
  requiredNotes: string;
  checklistOverride: string;
  rubricOverride: string;
}): { checklistForStudents: string; scoringRubric: string; source: string } {
  const { lessonId, lessonTitle, requiredNotes, checklistOverride, rubricOverride } = opts;

  // 1) from client payload (new)
  const checklistFromClient = (checklistOverride || requiredNotes || "").trim();
  const rubricFromClient = (rubricOverride || "").trim();
  if (checklistFromClient || rubricFromClient) {
    return {
      checklistForStudents: checklistFromClient,
      scoringRubric: rubricFromClient,
      source: "client",
    };
  }

  // 2) from TRUTH_GROUND by lessonId (legacy)
  const truthById: any = (TRUTH_GROUND as any)?.[lessonId];
  const checklistById = safeStr(truthById?.checklistForStudents);
  const rubricById = safeStr(truthById?.scoringRubric);
  if (checklistById || rubricById) {
    return { checklistForStudents: checklistById, scoringRubric: rubricById, source: "truth_ground:lessonId" };
  }

  // 3) fuzzy match by title (for cloned lessons where lessonId changed)
  const values = Object.values(TRUTH_GROUND as any) as any[];
  const normalizedTitle = (lessonTitle || "").trim().toLowerCase();

  let best: any = null;
  for (const v of values) {
    const t1 = safeStr(v?.lessonTitle).toLowerCase();
    const t2 = safeStr(v?.title).toLowerCase();
    if (!normalizedTitle) continue;
    if (t1 && t1 === normalizedTitle) {
      best = v;
      break;
    }
    if (t2 && t2 === normalizedTitle) {
      best = v;
      break;
    }
  }

  const checklistByTitle = safeStr(best?.checklistForStudents);
  const rubricByTitle = safeStr(best?.scoringRubric);
  if (checklistByTitle || rubricByTitle) {
    return { checklistForStudents: checklistByTitle, scoringRubric: rubricByTitle, source: "truth_ground:lessonTitle" };
  }

  return { checklistForStudents: "", scoringRubric: "", source: "missing" };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const lessonTitle = String(formData.get("lessonTitle") ?? "").trim();
    const lessonId = String(formData.get("lessonId") ?? "").trim();
    const files = formData.getAll("files") as File[];

    // OPTIONAL: allow UI (or other callers) to pass these directly
    const requiredNotes = String(formData.get("requiredNotes") ?? "").trim(); // same as "Nội dung bắt buộc phải chép"
    const checklistOverride = String(formData.get("checklistForStudents") ?? "").trim();
    const rubricOverride = String(formData.get("scoringRubric") ?? "").trim();

    if (!lessonTitle) {
      return NextResponse.json({ error: "Missing lessonTitle" }, { status: 400 });
    }
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Missing images" }, { status: 400 });
    }

    const resolved = resolveTruthGround({
      lessonId,
      lessonTitle,
      requiredNotes,
      checklistOverride,
      rubricOverride,
    });

    // ✅ Default rubric (so cloned classes still work even if truth ground missing)
    const defaultRubric = `
Chấm theo 2 tiêu chí:
- content_score (0–4): đối chiếu đúng checklistForStudents. Thiếu ý quan trọng trừ điểm. Nếu không có nội dung đúng checklist => 0.
- presentation_score (0–2): 2 rõ ràng/dễ đọc; 1 tạm được nhưng lộn xộn; 0 rất khó đọc/không nghiêm túc.
`.trim();

    const checklistForStudents = resolved.checklistForStudents.trim();
    const scoringRubric = (resolved.scoringRubric || defaultRubric).trim();

    // If checklist missing entirely, we still grade presentation, but content must be 0 (no ground truth).
    const hasChecklist = !!checklistForStudents;

    // ✅ Support many images, but cap to avoid oversized requests/cost
    const MAX_IMAGES = 6;
    const pick = files.slice(0, MAX_IMAGES);

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
- You MUST use the provided "Truth Ground" as the only ground truth for CONTENT.
- Do NOT grade based on vibe, length, or effort alone.
- If the writing is unrelated / random / doodles / off-topic => content_score MUST be 0.
- If handwriting is extremely illegible => presentation_score MUST be 0.
- If checklistForStudents is EMPTY (missing truth ground), you MUST:
  - set content_score = 0
  - still grade presentation_score (0–2)
  - feedback must tell admin/student that checklist is missing for this lesson.

Lesson: ${lessonTitle}
LessonId: ${lessonId}
TruthGroundSource: ${resolved.source}

TRUTH GROUND (must follow):
--- checklistForStudents ---
${checklistForStudents || "(EMPTY)"}
--- scoringRubric ---
${scoringRubric}

SCORING (STRICT):
A) content_score (0–4)
- Compare the notebook to checklistForStudents.
- Missing a required part => subtract points.
- If only 0–1 minor pieces present => content_score 1 max.
- If none of the required parts are present => content_score 0.
- "Wrote a lot" does NOT earn points unless it matches checklist content.
${hasChecklist ? "" : "- Since checklist is EMPTY, content_score MUST be 0."}

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
- Must mention what is MISSING compared to checklist (if checklist is present).
- Must mention 1 presentation improvement (if any).
- If checklist is EMPTY: explicitly say "Lesson này chưa có checklist nội dung bắt buộc" and ask admin to set it.
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
          content: "You are a strict, rubric-driven grader. Output valid JSON only.",
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

    // Hard rule: if no checklist, content_score must be 0
    if (!hasChecklist) out.content_score = 0;

    if (!out.feedback.length) {
      out.feedback = ["- Thiếu phản hồi từ AI. Hãy chụp rõ hơn và viết đúng checklist."];
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "Internal server error", detail: e?.message ?? String(e) }, { status: 500 });
  }
}