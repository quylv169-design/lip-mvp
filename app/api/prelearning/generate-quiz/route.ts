// app/api/prelearning/generate-quiz/route.ts
import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

type SkillTag =
  | "present_simple_base"
  | "present_simple_s_es"
  | "to_be"
  | "question_do_does"
  | "negation_does_not"
  | "pronoun_subject";

type QuizQ = {
  id: string;
  instruction_vi: string;
  instruction_en: string;
  sentence_en: string; // EN only, must contain exactly ONE ___ and exactly ONE "(...)"
  choices_en: string[]; // 4 choices
  answerIndex: number; // 0..3
  skill_tag: SkillTag; // required
  explain_vi?: string;
  common_mistake_vi?: string;
};

type QuizPayload = { questions: QuizQ[] };

const REQUIRED_Q = 7;

// ✅ Fixed distribution (stable pedagogy)
const DISTRIBUTION: SkillTag[] = [
  "present_simple_base",
  "present_simple_s_es",
  "to_be",
  "question_do_does",
  "negation_does_not",
  "pronoun_subject",
  "present_simple_base",
];

function safeStr(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeChoiceKey(s: string): string {
  return normalizeSpace(s).toLowerCase();
}

function choicesAreUnique(choices: string[]): boolean {
  const keys = choices.map((c) => normalizeChoiceKey(c));
  return new Set(keys).size === keys.length;
}

function isSkillTag(x: unknown): x is SkillTag {
  return (
    x === "present_simple_base" ||
    x === "present_simple_s_es" ||
    x === "to_be" ||
    x === "question_do_does" ||
    x === "negation_does_not" ||
    x === "pronoun_subject"
  );
}

function getLockToken(sentence: string): string {
  const m = sentence.match(/\(([^)]+)\)/);
  return (m?.[1] ?? "").trim().toLowerCase();
}

function stemVerb(w: string): string {
  return w
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(ing|ed|es|s)$/g, "")
    .trim();
}

function normalizeQuestion(q: unknown): QuizQ {
  const obj = (q ?? {}) as Record<string, unknown>;
  const rawChoices = Array.isArray(obj.choices_en) ? (obj.choices_en as unknown[]) : [];
  const choices = rawChoices.map((c) => normalizeSpace(safeStr(c)));

  const skillRaw = normalizeSpace(safeStr(obj.skill_tag));
  const skill: SkillTag = isSkillTag(skillRaw) ? skillRaw : "present_simple_base";

  return {
    id: normalizeSpace(safeStr(obj.id)) || crypto.randomUUID(),
    instruction_vi: normalizeSpace(safeStr(obj.instruction_vi)),
    instruction_en: normalizeSpace(safeStr(obj.instruction_en)),
    sentence_en: normalizeSpace(safeStr(obj.sentence_en)),
    choices_en: choices,
    answerIndex: Number(obj.answerIndex ?? 0),
    skill_tag: skill,
    explain_vi: normalizeSpace(safeStr(obj.explain_vi)) || undefined,
    common_mistake_vi: normalizeSpace(safeStr(obj.common_mistake_vi)) || undefined,
  };
}

/**
 * ✅ Pedagogical validator
 * - exactly one blank ___
 * - exactly one lock token "(...)"
 * - per-skill strict rules:
 *   - pronoun_subject: MUST have clue sentence => only one choice makes sense
 *   - negation_does_not: sentence must be "... does not ___ (baseVerb) ..." => correct must be baseVerb
 *   - verb-family: choices must belong to lock verb family
 */
function isValidQuestion(q: QuizQ): boolean {
  if (!q.id) return false;
  if (!q.instruction_vi || !q.instruction_en) return false;

  // blank token check
  const blanks = (q.sentence_en.match(/___/g) ?? []).length;
  if (blanks !== 1) return false;

  // lock token check
  const parens = q.sentence_en.match(/\([^)]+\)/g) ?? [];
  if (parens.length !== 1) return false;

  if (!q.skill_tag) return false;

  if (!Array.isArray(q.choices_en) || q.choices_en.length !== 4) return false;
  if (!q.choices_en.every((c) => typeof c === "string" && c.trim().length > 0)) return false;
  if (!choicesAreUnique(q.choices_en)) return false;

  const ai = q.answerIndex;
  if (!Number.isFinite(ai) || ai < 0 || ai > 3) return false;
  if (!q.choices_en[ai]) return false;

  const lock = getLockToken(q.sentence_en);
  if (!lock) return false;

  const choicesLower = q.choices_en.map((c) => normalizeSpace(c).toLowerCase());

  // ===== Skill-specific checks =====

  if (q.skill_tag === "pronoun_subject") {
    // lock must be (pronoun) or (subject_pronoun)
    if (lock !== "pronoun" && lock !== "subject_pronoun") return false;

    // choices must be pronouns only
    const allowed = new Set(["i", "you", "he", "she", "it", "we", "they"]);
    if (!choicesLower.every((c) => allowed.has(c))) return false;

    // Must contain a clue that forces ONE correct answer.
    // We enforce this by requiring:
    // - sentence contains one of these clue patterns:
    //   "This is my dad." => He
    //   "This is my mom." => She
    //   "This is my cat." => It
    //   "These are my friends." => They
    //   "I am ..." => I (but we avoid giving "I" in lock)
    // - and the correct answer must match the clue

    const s = q.sentence_en;

    // Normalize for matching
    const sLower = s.toLowerCase();

    let mustBe: string | null = null;

    if (sLower.includes("this is my dad") || sLower.includes("my dad") || sLower.includes("this is my father")) mustBe = "he";
    if (sLower.includes("this is my mom") || sLower.includes("my mom") || sLower.includes("this is my mother")) mustBe = "she";
    if (sLower.includes("this is my cat") || sLower.includes("my cat") || sLower.includes("this is my dog") || sLower.includes("my dog"))
      mustBe = "it";
    if (sLower.includes("these are my friends") || sLower.includes("these are my parents") || sLower.includes("these are my books"))
      mustBe = "they";

    // Also allow "___ am ..." => mustBe I
    if (sLower.includes("___ am")) mustBe = "i";

    // If no clue, reject (prevents “___ like pizza.” ambiguity)
    if (!mustBe) return false;

    const correct = choicesLower[q.answerIndex];
    if (correct !== mustBe) return false;

    // Extra: ensure the sentence grammar matches singular/plural with is/are when possible
    // (soft check; not rejecting unless obviously inconsistent)
    return true;
  }

  if (q.skill_tag === "negation_does_not") {
    // must include "does not ___" (or "doesn't ___")
    const sLower = q.sentence_en.toLowerCase();
    if (!sLower.includes("does not ___") && !sLower.includes("doesn't ___")) return false;

    const base = lock; // base verb
    const baseStem = stemVerb(base);
    if (!baseStem) return false;

    // correct answer MUST be base verb (exact match ignoring case/space)
    const correct = choicesLower[q.answerIndex];
    if (normalizeSpace(correct) !== normalizeSpace(base)) return false;

    // all choices should be verb-family of base
    const stems = choicesLower.map((c) => stemVerb(c));
    const validFamily = stems.every((st) => st === baseStem && st.length > 0);
    if (!validFamily) return false;

    // Collocation sanity: if base is "do" and object is "sports", reject (prefer play sports)
    // This prevents unnatural / confusing phrasing for beginners.
    if (baseStem === "do" && sLower.includes("sports")) return false;

    return true;
  }

  // For all other skills: verb-family match when lock is a verb/base marker
  // - question_do_does uses lock (do) but choices are Do/Does/Did/Done etc => stem is "do" ok
  // - to_be uses lock (be) and choices are am/is/are/be => stem will be "", so handle separately

  if (q.skill_tag === "to_be") {
    // lock should be "be"
    if (lock !== "be") return false;

    const allowed = new Set(["am", "is", "are", "be"]);
    if (!choicesLower.every((c) => allowed.has(c))) return false;

    // correct must be one of am/is/are (not "be")
    const correct = choicesLower[q.answerIndex];
    if (correct === "be") return false;

    return true;
  }

  if (q.skill_tag === "question_do_does") {
    // lock should be "do"
    if (lock !== "do") return false;

    const allowed = new Set(["do", "does", "did", "done"]);
    if (!choicesLower.every((c) => allowed.has(c))) return false;

    // must contain "___ you" or "___ he/she/it" style question
    const sLower = q.sentence_en.toLowerCase();
    if (!sLower.startsWith("___")) return false;

    // If subject is he/she/it => correct should be does; else do
    const correct = choicesLower[q.answerIndex];
    const isHsi = /\b(he|she|it)\b/.test(sLower);
    const isIYouWeThey = /\b(i|you|we|they)\b/.test(sLower);

    if (isHsi && correct !== "does") return false;
    if (isIYouWeThey && correct !== "do") return false;

    return true;
  }

  // present_simple_* : lock is base verb; choices must be family
  if (q.skill_tag === "present_simple_base" || q.skill_tag === "present_simple_s_es") {
    const base = lock;
    const baseStem = stemVerb(base);
    if (!baseStem) return false;

    const stems = choicesLower.map((c) => stemVerb(c));
    const validFamily = stems.every((st) => st === baseStem && st.length > 0);
    if (!validFamily) return false;

    const sLower = q.sentence_en.toLowerCase();
    const correct = choicesLower[q.answerIndex];

    const hasHsi = /\b(he|she|it)\b/.test(sLower);
    const hasIYouWeThey = /\b(i|you|we|they)\b/.test(sLower);

    if (q.skill_tag === "present_simple_s_es") {
      // must be he/she/it context and correct should be 3rd singular (ends with s/es) OR irregular like "goes/does/has"
      if (!hasHsi) return false;

      // a simple heuristic: correct should not equal base (for regular verbs)
      // but allow irregular "has" when base is have, "does" when base do, "goes" when base go
      const baseNorm = normalizeSpace(base);
      if (baseNorm === "have") {
        if (correct !== "has") return false;
      } else if (baseNorm === "do") {
        if (correct !== "does") return false;
      } else if (baseNorm === "go") {
        if (correct !== "goes") return false;
      } else {
        // regular: correct should be base + s/es => stem same but choice != base
        if (correct === baseNorm) return false;
      }

      return true;
    }

    if (q.skill_tag === "present_simple_base") {
      // should be i/you/we/they context
      if (!hasIYouWeThey) return false;

      // correct should be base (not 3rd singular)
      if (normalizeSpace(correct) !== normalizeSpace(base)) return false;

      return true;
    }
  }

  return false;
}

function fallbackQuiz(_lessonTitle: string): QuizPayload {
  return {
    questions: [
      {
        id: crypto.randomUUID(),
        instruction_vi: "Chọn dạng đúng của động từ trong ngoặc (Hiện tại đơn).",
        instruction_en: "Choose the correct verb form (Present Simple).",
        sentence_en: "I ___ (learn) English.",
        choices_en: ["learn", "learns", "learning", "learned"],
        answerIndex: 0,
        skill_tag: "present_simple_base",
        explain_vi: "I → dùng động từ nguyên mẫu: learn.",
        common_mistake_vi: "Không thêm -s với I/you/we/they.",
      },
      {
        id: crypto.randomUUID(),
        instruction_vi: "Chia động từ trong ngoặc cho đúng với He/She/It (Hiện tại đơn).",
        instruction_en: "Choose the correct verb form for He/She/It (Present Simple).",
        sentence_en: "She ___ (go) to school every day.",
        choices_en: ["go", "goes", "going", "went"],
        answerIndex: 1,
        skill_tag: "present_simple_s_es",
        explain_vi: "She → go + es = goes.",
        common_mistake_vi: "Không dùng 'She go'.",
      },
      {
        id: crypto.randomUUID(),
        instruction_vi: "Chọn am/is/are đúng.",
        instruction_en: "Choose the correct form of 'to be'.",
        sentence_en: "He ___ (be) a student.",
        choices_en: ["am", "is", "are", "be"],
        answerIndex: 1,
        skill_tag: "to_be",
        explain_vi: "He → is.",
        common_mistake_vi: "Không dùng 'He are'.",
      },
      {
        id: crypto.randomUUID(),
        instruction_vi: "Chọn trợ động từ đúng (Do/Does).",
        instruction_en: "Choose the correct auxiliary (Do/Does).",
        sentence_en: "___ you like pizza? (do)",
        choices_en: ["Do", "Does", "Did", "Done"],
        answerIndex: 0,
        skill_tag: "question_do_does",
        explain_vi: "You → Do.",
        common_mistake_vi: "Does dùng cho he/she/it.",
      },
      {
        id: crypto.randomUUID(),
        instruction_vi: "Chọn dạng đúng sau 'does not'.",
        instruction_en: "Choose the correct verb form after 'does not'.",
        sentence_en: "She does not ___ (play) sports.",
        choices_en: ["play", "plays", "playing", "played"],
        answerIndex: 0,
        skill_tag: "negation_does_not",
        explain_vi: "Sau does not → dùng động từ nguyên mẫu: play.",
        common_mistake_vi: "Không dùng 'does not plays'.",
      },
      {
        id: crypto.randomUUID(),
        instruction_vi: "Chọn đại từ phù hợp để điền vào chỗ trống.",
        instruction_en: "Choose the correct subject pronoun.",
        sentence_en: "This is my dad. ___ is tall. (subject_pronoun)",
        choices_en: ["I", "He", "She", "They"],
        answerIndex: 1,
        skill_tag: "pronoun_subject",
        explain_vi: "Dad (bố) → He.",
        common_mistake_vi: "Không dùng She/They cho 'dad'.",
      },
      {
        id: crypto.randomUUID(),
        instruction_vi: "Chọn dạng đúng của động từ trong ngoặc (Hiện tại đơn).",
        instruction_en: "Choose the correct verb form (Present Simple).",
        sentence_en: "They ___ (have) a cat.",
        choices_en: ["have", "has", "having", "had"],
        answerIndex: 0,
        skill_tag: "present_simple_base",
        explain_vi: "They → have (không thêm -s).",
        common_mistake_vi: "Không dùng 'They has'.",
      },
    ],
  };
}

function buildPrompt(lessonTitle: string, nonce: string): string {
  // ✅ Strong template-based prompt: each question must follow a skill-specific template
  return `
Lesson: ${lessonTitle}
Generation nonce: ${nonce}

Create EXACTLY ${REQUIRED_Q} multiple-choice questions for Vietnamese absolute beginners (mất gốc).
You MUST follow the required distribution and templates below.

REQUIRED DISTRIBUTION (exactly in order):
1) present_simple_base
2) present_simple_s_es
3) to_be
4) question_do_does
5) negation_does_not
6) pronoun_subject
7) present_simple_base

GLOBAL HARD RULES:
- Output JSON only (no markdown).
- Each question has:
  - instruction_vi (Vietnamese, specific to the skill)
  - instruction_en (English, specific to the skill)
  - sentence_en: ENGLISH ONLY, contains EXACTLY ONE "___" and EXACTLY ONE "(...)" lock token
  - choices_en: EXACTLY 4 unique choices
  - answerIndex: 0..3 (exactly one correct)
  - skill_tag: must match the distribution item
- Vocabulary must be simple (school, mom, dad, cat, pizza, sports, English, TV, milk, etc.)
- Keep sentences short.

LOCK TOKEN RULE:
- For verb-based skills: lock token is the BASE verb, e.g. (study) (go) (play)
- For pronoun_subject: lock token MUST be (pronoun) or (subject_pronoun)
  - NEVER put (i)/(he)/(she)... because that leaks the answer.

TEMPLATES (MUST FOLLOW):

A) present_simple_base
- instruction_vi: "Chọn dạng đúng của động từ trong ngoặc (Hiện tại đơn)."
- instruction_en: "Choose the correct verb form (Present Simple)."
- sentence_en pattern: "I/You/We/They ___ (baseVerb) ..."
- choices_en must be 4 forms of baseVerb: [base, 3rd_s, V-ing, V-ed] (or similar family)
- correct MUST be base verb (not adds -s)

B) present_simple_s_es
- instruction_vi: "Chia động từ trong ngoặc cho đúng với He/She/It (Hiện tại đơn)."
- instruction_en: "Choose the correct verb form for He/She/It (Present Simple)."
- sentence_en pattern: "He/She/It ___ (baseVerb) ..."
- correct MUST be 3rd singular form (goes/does/has/plays)

C) to_be
- instruction_vi: "Chọn am/is/are đúng."
- instruction_en: "Choose the correct form of 'to be'."
- sentence_en pattern: "I/He/She/It/We/They ___ (be) ..."
- choices_en must be from: am/is/are/be (4 items)
- correct MUST be am/is/are (NOT "be")

D) question_do_does
- instruction_vi: "Chọn trợ động từ đúng (Do/Does)."
- instruction_en: "Choose the correct auxiliary (Do/Does)."
- sentence_en pattern: "___ you/we/they/I ... ? (do)" OR "___ he/she/it ... ? (do)"
- choices_en must be exactly: ["Do","Does","Did","Done"]
- correct MUST be Do for I/you/we/they, Does for he/she/it

E) negation_does_not
- instruction_vi: "Chọn dạng đúng sau 'does not'."
- instruction_en: "Choose the correct verb form after 'does not'."
- sentence_en pattern: "He/She does not ___ (baseVerb) ..."
- IMPORTANT: choose a NATURAL verb + object:
  - play sports
  - watch TV
  - study English
  - eat rice
  - drink milk
  - go to school (use base verb go)
- choices must be 4 forms of the SAME baseVerb: [base, 3rd_s, V-ing, V-ed]
- correct MUST be base verb
- DO NOT use baseVerb = "do" with "sports" (prefer play sports)

F) pronoun_subject
- instruction_vi: "Chọn đại từ phù hợp để điền vào chỗ trống."
- instruction_en: "Choose the correct subject pronoun."
- sentence MUST include a CLUE so only ONE choice is correct. Use one of these patterns:
  1) "This is my dad. ___ is tall. (subject_pronoun)" => answer He
  2) "This is my mom. ___ is kind. (subject_pronoun)" => answer She
  3) "This is my cat. ___ is small. (subject_pronoun)" => answer It
  4) "These are my friends. ___ are happy. (subject_pronoun)" => answer They
  5) "___ am 10 years old. (subject_pronoun)" => answer I (ensure choices include I and exclude You to keep only one correct)
- choices_en must be 4 pronouns from: I/He/She/It/They/We/You
- Ensure ONLY ONE choice fits the clue.

OUTPUT JSON schema:
{
  "questions": [
    {
      "id": "string",
      "instruction_vi": "string",
      "instruction_en": "string",
      "sentence_en": "string",
      "choices_en": ["A","B","C","D"],
      "answerIndex": 0,
      "skill_tag": "present_simple_base|present_simple_s_es|to_be|question_do_does|negation_does_not|pronoun_subject",
      "explain_vi": "1 câu giải thích rất ngắn (VN)",
      "common_mistake_vi": "1 lỗi hay gặp rất ngắn (VN, nếu có)"
    }
  ]
}

FINAL SELF-CHECK:
- EXACTLY ${REQUIRED_Q} questions
- skill_tag order matches distribution
- No ambiguous pronoun question (only one correct)
- negation_does_not correct is base verb
- English only in sentence_en
`.trim();
}

async function generateOnce(lessonTitle: string, nonce: string): Promise<QuizPayload> {
  const prompt = buildPrompt(lessonTitle, nonce);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You generate strict, pedagogy-safe ESL quizzes. Output valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as unknown;

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const qsRaw = Array.isArray(obj.questions) ? (obj.questions as unknown[]) : [];

  const qsNorm = qsRaw.map((q: unknown) => normalizeQuestion(q));

  // Filter invalid
  const qsGood = qsNorm.filter((q: QuizQ) => isValidQuestion(q));

  // Enforce distribution order: we take only those that match expected tags in order
  const out: QuizQ[] = [];
  const pool = [...qsGood];

  for (const tag of DISTRIBUTION) {
    const idx = pool.findIndex((q) => q.skill_tag === tag);
    if (idx === -1) return { questions: [] };
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return { questions: out };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const obj = (body ?? {}) as Record<string, unknown>;

    const lessonTitle = normalizeSpace(safeStr(obj.lessonTitle));
    if (!lessonTitle) {
      return NextResponse.json({ error: "Missing lessonTitle" }, { status: 400 });
    }

    // ✅ Always fresh quiz each request
    const nonce1 = crypto.randomUUID();
    let payload = await generateOnce(lessonTitle, nonce1);

    // Retry once if invalid
    if (payload.questions.length !== REQUIRED_Q) {
      const nonce2 = crypto.randomUUID();
      payload = await generateOnce(lessonTitle, nonce2);
    }

    if (payload.questions.length !== REQUIRED_Q) {
      payload = fallbackQuiz(lessonTitle);
    }

    const finalQuestions = payload.questions.slice(0, REQUIRED_Q);
    if (finalQuestions.length !== REQUIRED_Q) {
      return NextResponse.json({ questions: fallbackQuiz(lessonTitle).questions }, { status: 200 });
    }

    return NextResponse.json({ questions: finalQuestions }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}