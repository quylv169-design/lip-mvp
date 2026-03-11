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
  item: string; // required point
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
 * If checkpoints is empty, return 0 (strict).
 */
function computeCoverageFromCheckpoints(checkpoints: ModelCheckpoint[]): number {
  if (!checkpoints.length) return 0;
  const sum = checkpoints.reduce((acc, cp) => acc + normalizeHit(cp.hit), 0);
  return clamp(sum / checkpoints.length, 0, 1);
}

/**
 * Extract deterministic checkpoints from checklistForStudents (server-side),
 * so the model cannot "cheat" by creating too few/too broad checkpoints.
 *
 * Heuristics:
 * - Split by lines
 * - Keep lines that look like bullets/numbered/meaningful text
 * - Strip leading bullets/numbers
 * - Deduplicate
 * - Keep 6..12 items (cap at 12, if <6 keep what exists)
 */
function extractCheckpointsFromChecklist(checklist: string): string[] {
  const rawLines = (checklist || "")
    .split(/\r?\n/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const cleaned: string[] = [];
  for (let line of rawLines) {
    // Strip typical prefixes: "- ", "• ", "* ", "1) ", "1. ", "1 - ", "– "
    line = line.replace(/^\s*[-•*–—]\s+/g, "");
    line = line.replace(/^\s*\d+\s*[\.\)\-–—]\s*/g, "");
    line = line.replace(/\s+/g, " ").trim();

    // Skip very short/noisy lines
    if (line.length < 6) continue;

    // Skip headings that are too generic
    const low = line.toLowerCase();
    if (
      low === "ví dụ" ||
      low === "ví dụ:" ||
      low === "example" ||
      low === "examples" ||
      low === "lưu ý" ||
      low === "note"
    ) {
      continue;
    }

    cleaned.push(line.slice(0, 120));
  }

  // Dedup (case-insensitive)
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const it of cleaned) {
    const key = it.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  // Keep up to 12 (truth-ground can be long; first lines are typically the required structure)
  return deduped.slice(0, 12);
}

/**
 * Resolve Truth Ground in this priority:
 * 1) From client formData: requiredNotes / checklistForStudents, rubric / scoringRubric
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
  const {
    lessonId,
    lessonTitle,
    requiredNotes,
    checklistOverride,
    rubricOverride,
  } = opts;

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
    return {
      checklistForStudents: checklistById,
      scoringRubric: rubricById,
      source: "truth_ground:lessonId",
    };
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
    return {
      checklistForStudents: checklistByTitle,
      scoringRubric: rubricByTitle,
      source: "truth_ground:lessonTitle",
    };
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
    const checklistOverride = String(
      formData.get("checklistForStudents") ?? ""
    ).trim();

    // support both new field name "rubric" and old field name "scoringRubric"
    const rubricField = String(formData.get("rubric") ?? "").trim();
    const scoringRubricField = String(
      formData.get("scoringRubric") ?? ""
    ).trim();
    const rubricOverride = (rubricField || scoringRubricField).trim();

    if (!lessonTitle)
      return NextResponse.json({ error: "Missing lessonTitle" }, { status: 400 });
    if (!lessonId)
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    if (!files || files.length === 0)
      return NextResponse.json({ error: "Missing images" }, { status: 400 });

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

    // ✅ Deterministic checkpoints derived from truth ground
    const derivedCheckpointItems = hasChecklist
      ? extractCheckpointsFromChecklist(checklistForStudents)
      : [];

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
     * ✅ Scoring approach (MVP-strong, deterministic checkpoints):
     * - Server extracts checkpoints from checklistForStudents (cannot be gamed by model)
     * - Model only evaluates each checkpoint hit (0/0.5/1) with evidence
     * - Server computes coverage_ratio = avg(hit)
     * - Server maps coverage_ratio -> content_score using strict thresholds
     * - Server derives missing_items from hit<1 (ignores model-provided missing list)
     */
    const prompt = `
You are grading a student's handwritten notebook for PRE-LEARNING.

ABSOLUTE RULES:
- You MUST use the provided "Truth Ground" as the only ground truth for CONTENT.
- You MUST use the provided "scoringRubric" as the grading policy for both content and presentation.
- You MUST grade ONLY based on what is visible in the uploaded notebook images.
- DO NOT assume "maybe on another page". If you don't see it, it is missing.
- If the writing is unrelated / random / doodles / off-topic => all hits=0.
- If handwriting is extremely illegible => presentation_score MUST be 0.
- If checklistForStudents is EMPTY (missing truth ground), you MUST:
  - set checkpoints = []
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

CHECKPOINTS (server-derived, do NOT change wording):
${
  derivedCheckpointItems.length
    ? derivedCheckpointItems.map((x, i) => `${i + 1}) ${x}`).join("\n")
    : "(NONE)"
}

TASK (STRICT):
- For EACH checkpoint above, return:
  - hit = 1   if clearly present in notebook images
  - hit = 0.5 if partially present / unclear / missing example / not complete
  - hit = 0   if not seen
  - evidence: very short phrase of what you saw (Vietnamese OK)
- Grade presentation_score (0–2) according to scoringRubric. If scoringRubric is vague, follow:
  - 2: dễ đọc, có bố cục (tiêu đề/đánh số), sạch sẽ
  - 1: đọc được nhưng lộn xộn
  - 0: rất khó đọc/nguệch ngoạc
- feedback: 3–7 gạch đầu dòng tiếng Việt, cực ngắn, actionable
  - nếu thiếu: nêu 2–4 ý thiếu quan trọng nhất
  - nêu 1 góp ý trình bày (nếu cần)
  - if rubric has specific emphasis, reflect it in feedback

OUTPUT JSON ONLY with EXACT schema (no extra keys):
{
  "checkpoints": [{"item": string, "hit": 0|0.5|1, "evidence": string}],
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
          content:
            "You are a strict, rubric-driven grader. Output valid JSON only.",
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
      return NextResponse.json(
        { error: "Model returned non-JSON", raw },
        { status: 500 }
      );
    }

    // --- Normalize model outputs ---
    const modelCheckpoints = normalizeCheckpointArray(parsed?.checkpoints);
    const presentationScore = clamp(toNum(parsed?.presentation_score, 0), 0, 2);
    let feedback = toStringArray(parsed?.feedback).slice(0, 12);

    // --- Build final checkpoints aligned to server-derived items ---
    let finalCheckpoints: ModelCheckpoint[] = [];

    if (!hasChecklist) {
      finalCheckpoints = [];
    } else {
      const byItem = new Map<string, ModelCheckpoint>();
      for (const cp of modelCheckpoints) {
        const key = safeStr(cp.item).toLowerCase();
        if (!key) continue;
        // keep first occurrence
        if (!byItem.has(key)) byItem.set(key, cp);
      }

      finalCheckpoints = derivedCheckpointItems.map((item) => {
        const key = item.toLowerCase();
        const m = byItem.get(key);
        return {
          item,
          hit: m ? normalizeHit(m.hit) : 0,
          evidence: m?.evidence ? safeStr(m.evidence).slice(0, 280) : undefined,
        };
      });
    }

    // --- Compute coverage ourselves (ONLY from final checkpoints) ---
    const coverage = computeCoverageFromCheckpoints(finalCheckpoints);

    // --- missing items computed from final checkpoints (ignore model missing_items) ---
    const missingItems = finalCheckpoints
      .filter((cp) => normalizeHit(cp.hit) < 1)
      .map((cp) => cp.item);

    // --- Derive content score from coverage thresholds ---
    let contentScore = coverageToContentScore4(coverage);

    // Hard rule: if no checklist, content must be 0 (no ground truth)
    if (!hasChecklist) {
      contentScore = 0;
    } else {
      // Hard guard: if any missing => cannot be 4/4
      if (missingItems.length > 0 && contentScore >= 4) {
        contentScore = 3;
      }

      // Extra guard: if derived checkpoints are suspiciously few, cap score (prevents “too generic truth ground”)
      // (We still allow full points when checklist truly short, but in MVP it's safer.)
      if (derivedCheckpointItems.length > 0 && derivedCheckpointItems.length < 4) {
        contentScore = Math.min(contentScore, 3);
      }
    }

    const out: NotebookEvalOut = {
      content_score: clamp(contentScore, 0, 4),
      presentation_score: presentationScore,
      feedback: feedback.length
        ? feedback
        : ["- Thiếu phản hồi từ AI. Hãy chụp rõ hơn và viết đúng checklist."],
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal server error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}