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

type ModelCheckpoint = {
  item: string; // short required point (derived from checklist)
  hit: number; // 0 | 0.5 | 1
  evidence?: string; // where/what seen in notebook
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

function normalizeHit(v: any): 0 | 0.5 | 1 {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n >= 0.75) return 1;
  if (n >= 0.25) return 0.5;
  return 0;
}

function normalizeCheckpointArray(v: any): ModelCheckpoint[] {
  if (!Array.isArray(v)) return [];
  const out: ModelCheckpoint[] = [];
  for (const it of v) {
    const item = safeStr(it?.item);
    if (!item) continue;
    out.push({
      item: item.slice(0, 220),
      hit: normalizeHit(it?.hit),
      evidence: safeStr(it?.evidence).slice(0, 280) || undefined,
    });
  }
  return out;
}

/**
 * Map coverage_ratio (0..1) -> content_score (0..4)
 * Threshold-based to prevent "a little bit but high score".
 */
function coverageToContentScore4(coverage: number): number {
  const c = clamp(coverage, 0, 1);
  if (c < 0.25) return 0;
  if (c < 0.5) return 1;
  if (c < 0.75) return 2;
  if (c < 0.9) return 3;
  return 4;
}

/**
 * Compute coverage from checkpoints (equal weights).
 * If model returns 0 checkpoints, return null.
 */
function computeCoverageFromCheckpoints(checkpoints: ModelCheckpoint[]): number | null {
  if (!checkpoints.length) return null;
  const sum = checkpoints.reduce((acc, cp) => acc + normalizeHit(cp.hit), 0);
  return clamp(sum / checkpoints.length, 0, 1);
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

    if (!lessonTitle) return NextResponse.json({ error: "Missing lessonTitle" }, { status: 400 });
    if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    if (!files || files.length === 0) return NextResponse.json({ error: "Missing images" }, { status: 400 });

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
    const MAX_IMAGES = 10;
    const pick = files.slice(0, MAX_IMAGES);

    const images = await Promise.all(
      pick.map(async (f) => {
        const buf = Buffer.from(await f.arrayBuffer());
        const mime = f.type || "image/jpeg";
        return `data:${mime};base64,${buf.toString("base64")}`;
      })
    );

    /**
     * ✅ New scoring approach (MVP-strong):
     * - Model must derive 6–12 "checkpoints" from checklistForStudents (major required points)
     * - For each checkpoint, mark hit (0/0.5/1) based ONLY on what is visible in notebook photos
     * - Server computes coverage_ratio = avg(hit)
     * - Server maps coverage_ratio -> content_score using strict thresholds
     * - Hard rule: if missing_items is non-empty => cannot be 4/4
     */
    const prompt = `
You are grading a student's handwritten notebook for PRE-LEARNING.

ABSOLUTE RULES:
- You MUST use the provided "Truth Ground" as the only ground truth for CONTENT.
- You MUST grade ONLY based on what is visible in the uploaded notebook images.
- DO NOT assume "maybe on another page". If you don't see it, it is missing.
- If the writing is unrelated / random / doodles / off-topic => all checkpoints hit=0.
- If handwriting is extremely illegible => presentation_score MUST be 0.
- If checklistForStudents is EMPTY (missing truth ground), you MUST:
  - set checkpoints = []
  - coverage_ratio = 0
  - missing_items = []
  - presentation_score still graded (0–2)
  - feedback must say checklist is missing for this lesson (ask admin to set it).

Lesson: ${lessonTitle}
LessonId: ${lessonId}
TruthGroundSource: ${resolved.source}

TRUTH GROUND:
--- checklistForStudents ---
${checklistForStudents || "(EMPTY)"}
--- scoringRubric ---
${scoringRubric}

TASK (STRICT):
1) From checklistForStudents, create 6–12 SHORT "checkpoints" (major required points).
   - Each checkpoint should be a short phrase in Vietnamese (max ~12 words).
   - DO NOT invent checkpoints not present in checklist.
2) For each checkpoint, decide hit:
   - 1   = clearly present in notebook images
   - 0.5 = partially present / unclear / missing example / not complete
   - 0   = not seen
   Also add "evidence" (very short) describing what you saw (e.g., "Có dòng 'He/She/It + V(s/es)'").
3) Compute coverage_ratio = average(hit) across checkpoints (0..1).
4) missing_items = list of checkpoint.item where hit < 1 (include both 0 and 0.5).
5) Grade presentation_score (0–2):
   - 2: dễ đọc, có bố cục (tiêu đề/đánh số), sạch sẽ
   - 1: đọc được nhưng lộn xộn
   - 0: rất khó đọc/nguệch ngoạc
6) feedback: 3–7 gạch đầu dòng tiếng Việt, cực ngắn, actionable
   - Nếu có missing_items: nêu rõ 2–4 ý thiếu quan trọng nhất
   - Nêu 1 góp ý trình bày (nếu cần)

OUTPUT JSON ONLY with EXACT schema (no extra keys):
{
  "checkpoints": [{"item": string, "hit": 0|0.5|1, "evidence": string}],
  "coverage_ratio": number,
  "missing_items": string[],
  "presentation_score": number,
  "feedback": string[]
}
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

    // --- Normalize model outputs ---
    const checkpoints = normalizeCheckpointArray(parsed?.checkpoints);
    const modelCoverage = clamp(toNum(parsed?.coverage_ratio, 0), 0, 1);
    const missingItems = toStringArray(parsed?.missing_items).slice(0, 30);

    const presentationScore = clamp(toNum(parsed?.presentation_score, 0), 0, 2);
    let feedback = toStringArray(parsed?.feedback).slice(0, 12);

    // --- Compute coverage ourselves (preferred) ---
    const computedCoverage = computeCoverageFromCheckpoints(checkpoints);
    const coverage = computedCoverage ?? modelCoverage;

    // --- Derive content score from coverage thresholds ---
    let contentScore = coverageToContentScore4(coverage);

    // Hard rule: if no checklist, content must be 0 (no ground truth)
    if (!hasChecklist) {
      contentScore = 0;
    } else {
      // Hard guard: if missing_items exists => cannot be 4/4
      // (4/4 means fully complete vs checklist)
      if (missingItems.length > 0 && contentScore >= 4) {
        contentScore = 3;
      }

      // Extra guard: if model returned no checkpoints but claimed high coverage, distrust
      if (!checkpoints.length && modelCoverage >= 0.9) {
        // Force at most 3 unless checkpoints are provided as evidence
        contentScore = Math.min(contentScore, 3);
      }
    }

    const out: NotebookEvalOut = {
      content_score: clamp(contentScore, 0, 4),
      presentation_score: presentationScore,
      feedback: feedback.length ? feedback : ["- Thiếu phản hồi từ AI. Hãy chụp rõ hơn và viết đúng checklist."],
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "Internal server error", detail: e?.message ?? String(e) }, { status: 500 });
  }
}