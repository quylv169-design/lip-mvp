// lib/practice/bank.ts
import type { PracticeBank } from "./types";

export const PRACTICE_BANK: PracticeBank = {
  "377daeb8-bada-47df-9c39-7a2dceea23ad": {
    lessonId: "377daeb8-bada-47df-9c39-7a2dceea23ad",
    sections: [
      {
        id: "ex1-present-simple-verb-conjugation",
        titleVi: "Bài tập 1: Chia động từ trong ngoặc với thì hiện tại đơn",
        titleEn: "Exercise 1: Present Simple – Verb Conjugation",
        questions: [
          {
            id: "ex1-q1",
            prompt: "1) Linh (work) ________ in a hospital.",
            choices: [{ text: "work" }, { text: "works" }, { text: "worked" }, { text: "working" }],
            answerIndex: 1,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "Hiện tại đơn: ngôi 3 số ít (He/She/It/Linh) → V-s hoặc -es. Không thuộc s, sh, ch, o, x → thêm -s: works.",
          },
          {
            id: "ex1-q2",
            prompt: "2) Cat (like) ________ fish.",
            choices: [{ text: "like" }, { text: "likes" }, { text: "liked" }, { text: "liking" }],
            answerIndex: 1,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "Ngôi 3 số ít (Cat) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'like' không thuộc nhóm -es → likes.",
          },
          {
            id: "ex1-q3",
            prompt: "3) Myan (live) ________ in California.",
            choices: [{ text: "live" }, { text: "lives" }, { text: "lived" }, { text: "living" }],
            answerIndex: 1,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "Ngôi 3 số ít (Myan) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'live' không thuộc nhóm -es → lives.",
          },
          {
            id: "ex1-q4",
            prompt: "4) It (rain) ________ almost every afternoon in French.",
            choices: [{ text: "rain" }, { text: "rains" }, { text: "rained" }, { text: "raining" }],
            answerIndex: 1,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "'It' là ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'rain' → thêm -s: rains.",
          },
          {
            id: "ex1-q5",
            prompt: "5) My son (fry) ________ eggs for breakfast everyday.",
            choices: [{ text: "fry" }, { text: "fries" }, { text: "fried" }, { text: "frying" }],
            answerIndex: 1,
            skill_tag: "ps_y_to_ies",
            explainVi:
              "Ngôi 3 số ít (my son) → chia hiện tại đơn. Động từ tận cùng phụ âm + y → đổi y → ies: fry → fries.",
          },
          {
            id: "ex1-q6",
            prompt: "6) The museum (close) ________ at 8 pm.",
            choices: [{ text: "close" }, { text: "closes" }, { text: "closed" }, { text: "closing" }],
            answerIndex: 1,
            skill_tag: "ps_add_es_endings",
            explainVi:
              "Ngôi 3 số ít (the museum) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'close' → closes.",
          },
          {
            id: "ex1-q7a",
            prompt: "7) He (try) ________ hard in class, ...",
            choices: [{ text: "try" }, { text: "tries" }, { text: "tried" }, { text: "trying" }],
            answerIndex: 1,
            skill_tag: "ps_y_to_ies",
            explainVi:
              "'He' ngôi 3 số ít → chia hiện tại đơn. try tận cùng phụ âm + y → đổi y → ies: try → tries.",
          },
          {
            id: "ex1-q7b",
            prompt: "7) ... but I (not think) ________ he'll pass.",
            choices: [
              { text: "don’t think" },
              { text: "am not think" },
              { text: "doesn’t think" },
              { text: "didn’t think" },
            ],
            answerIndex: 0,
            skill_tag: "ps_negative_do_not",
            explainVi:
              "Phủ định hiện tại đơn với động từ thường: I/You/We/They → do not + V nguyên mẫu. 'I' → don’t think.",
          },
          {
            id: "ex1-q8",
            prompt: "8) ... she (pass) ________ every exam without even trying.",
            choices: [{ text: "pass" }, { text: "passes" }, { text: "passed" }, { text: "passing" }],
            answerIndex: 1,
            skill_tag: "ps_add_es_endings",
            explainVi:
              "'She' ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. pass tận cùng 'ss' → passes.",
          },
          {
            id: "ex1-q9a",
            prompt: "9) Your life (be) _____ so boring.",
            choices: [{ text: "are" }, { text: "is" }, { text: "am" }, { text: "were" }],
            answerIndex: 1,
            skill_tag: "ps_to_be_forms",
            explainVi:
              "Động từ to be hiện tại: I am / You are / He-She-It (số ít) is. 'Your life' số ít → is.",
          },
          {
            id: "ex1-q9b",
            prompt: "9) You just (watch) ________ TV everyday.",
            choices: [{ text: "watches" }, { text: "watch" }, { text: "watched" }, { text: "watching" }],
            answerIndex: 1,
            skill_tag: "ps_base_form_after_subjects",
            explainVi:
              "Hiện tại đơn: I/You/We/They + V nguyên mẫu (không thêm -s/-es). 'You' → watch.",
          },
          {
            id: "ex1-q10",
            prompt: "10) His girlfriend (write) ________ to him two times a week.",
            choices: [{ text: "write" }, { text: "writes" }, { text: "wrote" }, { text: "writing" }],
            answerIndex: 1,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "Ngôi 3 số ít (his girlfriend) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'write' → writes.",
          },
          {
            id: "ex1-q11",
            prompt: "11) You (speak) ________ English?",
            choices: [
              { text: "Are you speak" },
              { text: "Do you speak" },
              { text: "Does you speak" },
              { text: "Did you speak" },
            ],
            answerIndex: 1,
            skill_tag: "ps_question_do_does",
            explainVi:
              "Câu hỏi với động từ thường (hiện tại đơn): Do/Does + S + V nguyên mẫu. 'You' → Do you speak?",
          },
          {
            id: "ex1-q12",
            prompt: "12) She (not live) ________ in Ho Chi Minh city.",
            choices: [{ text: "don’t live" }, { text: "doesn’t live" }, { text: "didn’t live" }, { text: "isn’t live" }],
            answerIndex: 1,
            skill_tag: "ps_negative_does_not",
            explainVi:
              "Phủ định hiện tại đơn: He/She/It → does not + V nguyên mẫu (sau does bỏ -s). She → doesn’t live.",
          },
        ],
      },

      {
        id: "ex2-to-be",
        titleVi: "Bài tập 2: Điền dạng đúng của động từ to be",
        titleEn: "Exercise 2: Verb “To Be” – Fill in the Blanks",
        questions: [
          {
            id: "ex2-q1",
            prompt: "1) His cat __________ small.",
            choices: [{ text: "am" }, { text: "is" }, { text: "are" }, { text: "be" }],
            answerIndex: 1,
            skill_tag: "ps_to_be_forms",
            explainVi:
              "To be hiện tại: I am / You are / He-She-It (số ít) is. 'His cat' số ít → is.",
          },
          {
            id: "ex2-q2",
            prompt: "2) Linh ________ a student.",
            choices: [{ text: "am" }, { text: "is" }, { text: "are" }, { text: "be" }],
            answerIndex: 1,
            skill_tag: "ps_to_be_forms",
            explainVi:
              "Tên riêng 1 người = số ít → dùng 'is' (I am / You are / He-She-It is). Linh → is.",
          },
          {
            id: "ex2-q3",
            prompt: "3) They _________ ready to get a pet.",
            choices: [{ text: "is" }, { text: "am" }, { text: "are" }, { text: "be" }],
            answerIndex: 2,
            skill_tag: "ps_to_be_forms",
            explainVi: "'They' là số nhiều → dùng 'are' (I am / You are / We/They are).",
          },
          {
            id: "ex2-q4",
            prompt: "4) My life _____ so boring.",
            choices: [{ text: "are" }, { text: "am" }, { text: "is" }, { text: "be" }],
            answerIndex: 2,
            skill_tag: "ps_to_be_forms",
            explainVi: "'My life' số ít → dùng 'is' (He/She/It is).",
          },
          {
            id: "ex2-q5a",
            prompt: "5) Her husband ________ from China.",
            choices: [{ text: "are" }, { text: "is" }, { text: "am" }, { text: "be" }],
            answerIndex: 1,
            skill_tag: "ps_to_be_forms",
            explainVi: "'Her husband' số ít → dùng 'is'.",
          },
          {
            id: "ex2-q5b",
            prompt: "5) She _______ from Viet Nam.",
            choices: [{ text: "are" }, { text: "is" }, { text: "am" }, { text: "be" }],
            answerIndex: 1,
            skill_tag: "ps_to_be_forms",
            explainVi: "'She' → dùng 'is' (I am / You are / She is).",
          },
          {
            id: "ex2-q6",
            prompt: "6) They ____________ (not/be) late.",
            choices: [{ text: "isn’t" }, { text: "aren’t" }, { text: "don’t be" }, { text: "doesn’t be" }],
            answerIndex: 1,
            skill_tag: "ps_negative_special_verbs",
            explainVi: "Phủ định với 'to be': thêm 'not' sau be. They are not → aren’t.",
          },
          {
            id: "ex2-q7",
            prompt: "7) I and my sister (be)________ good friends.",
            choices: [{ text: "is" }, { text: "am" }, { text: "are" }, { text: "be" }],
            answerIndex: 2,
            skill_tag: "ps_to_be_forms",
            explainVi: "“I and my sister” = 2 người → chủ ngữ số nhiều → dùng 'are'.",
          },
          {
            id: "ex2-q8",
            prompt: "8) ___________ (she/be) a doctor?",
            choices: [{ text: "Are she" }, { text: "Is she" }, { text: "Does she is" }, { text: "She is" }],
            answerIndex: 1,
            skill_tag: "ps_question_special_verbs",
            explainVi: "Câu hỏi với 'to be': đưa be lên đầu câu. She → Is she a doctor?",
          },
          {
            id: "ex2-q9",
            prompt: "9) Her sister (be) _________ 9 years old.",
            choices: [{ text: "are" }, { text: "am" }, { text: "is" }, { text: "be" }],
            answerIndex: 2,
            skill_tag: "ps_to_be_forms",
            explainVi: "'Her sister' số ít → dùng 'is'.",
          },
          {
            id: "ex2-q10",
            prompt: "10) Max and Lan (be)__________ my cats.",
            choices: [{ text: "is" }, { text: "am" }, { text: "are" }, { text: "be" }],
            answerIndex: 2,
            skill_tag: "ps_to_be_forms",
            explainVi: "“Max and Lan” = 2 người → số nhiều → dùng 'are'.",
          },
        ],
      },

      {
        id: "ex3-word-bank",
        titleVi: "Bài tập 3: Hoàn thành câu sử dụng động từ cho sẵn",
        titleEn: "Exercise 3: Complete the Sentences (Word Bank)",
        questions: [
          {
            id: "ex3-q1",
            prompt: "1) Myan _____________ handball very well.",
            choices: [{ text: "drinks" }, { text: "plays" }, { text: "closes" }, { text: "lives" }],
            answerIndex: 1,
            skill_tag: "ps_sentence_completion",
            explainVi: "Cụm đúng: play + môn thể thao (play handball). Các đáp án khác không hợp nghĩa/collocation.",
          },
          {
            id: "ex3-q2",
            prompt: "2) They never _____________ tea.",
            choices: [{ text: "do" }, { text: "take" }, { text: "drink" }, { text: "speak" }],
            answerIndex: 2,
            skill_tag: "ps_adverb_frequency_usage",
            explainVi: "Cụm đúng: drink tea = uống trà. 'never' chỉ thói quen → dùng hiện tại đơn.",
          },
          {
            id: "ex3-q3",
            prompt: "3) The swimming pool _____________ at 6:30 in the morning.",
            choices: [{ text: "close" }, { text: "take" }, { text: "opens" }, { text: "plays" }],
            answerIndex: 2,
            skill_tag: "ps_fixed_schedule",
            explainVi:
              "Lịch trình cố định → hiện tại đơn. Chủ ngữ số ít → V-s hoặc -es; 'open' không thuộc s, sh, ch, o, x → opens.",
          },
          {
            id: "ex3-q4",
            prompt: "4) It _____________ at 7 pm in the evening.",
            choices: [{ text: "open" }, { text: "wake up" }, { text: "closes" }, { text: "speak" }],
            answerIndex: 2,
            skill_tag: "ps_fixed_schedule",
            explainVi:
              "Lịch trình → hiện tại đơn. 'It' ngôi 3 số ít → V-s hoặc -es; 'close' → closes (tận cùng s → thêm -es).",
          },
          {
            id: "ex3-q5",
            prompt: "5) Bad driving _____________ many accidents.",
            choices: [{ text: "take" }, { text: "play" }, { text: "causes" }, { text: "opens" }],
            answerIndex: 2,
            skill_tag: "ps_truths_and_facts",
            explainVi:
              "Sự thật chung → hiện tại đơn. Chủ ngữ số ít → V-s hoặc -es; 'cause' → causes (tận cùng s → thêm -es).",
          },
          {
            id: "ex3-q6",
            prompt: "6) Her parents _____________ in a very small flat.",
            choices: [{ text: "do" }, { text: "speak" }, { text: "live" }, { text: "drink" }],
            answerIndex: 2,
            skill_tag: "ps_base_form_after_subjects",
            explainVi: "'Her parents' số nhiều → dùng V nguyên mẫu (không thêm -s/-es). Động từ đúng theo nghĩa: live.",
          },
          {
            id: "ex3-q7",
            prompt: "7) The Olympic Games _____________ place every four years.",
            choices: [{ text: "do" }, { text: "take" }, { text: "play" }, { text: "open" }],
            answerIndex: 1,
            skill_tag: "ps_sentence_completion",
            explainVi: "Cụm cố định: take place = diễn ra. 'do/play/open place' sai collocation.",
          },
          {
            id: "ex3-q8",
            prompt: "8) They always _____________ their homework.",
            choices: [{ text: "take" }, { text: "play" }, { text: "do" }, { text: "drink" }],
            answerIndex: 2,
            skill_tag: "ps_adverb_frequency_usage",
            explainVi: "Cụm đúng: do homework. 'always' chỉ thói quen → hiện tại đơn.",
          },
          {
            id: "ex3-q9",
            prompt: "9) The students _____________ a little English.",
            choices: [{ text: "do" }, { text: "drink" }, { text: "speak" }, { text: "open" }],
            answerIndex: 2,
            skill_tag: "ps_sentence_completion",
            explainVi: "Cụm đúng: speak English = nói tiếng Anh. Chủ ngữ số nhiều → V nguyên mẫu.",
          },
          {
            id: "ex3-q10",
            prompt: "10) I always _____________ late in the morning.",
            choices: [{ text: "take" }, { text: "wake up" }, { text: "open" }, { text: "cause" }],
            answerIndex: 1,
            skill_tag: "ps_adverb_frequency_usage",
            explainVi: "Cụm đúng: wake up = thức dậy. 'always' chỉ thói quen → hiện tại đơn.",
          },
        ],
      },

      {
        id: "ex4-mcq-present-simple",
        titleVi: "Bài tập 4: Bài tập trắc nghiệm thì hiện tại đơn",
        titleEn: "Exercise 4: Present Simple – Multiple Choice Quiz",
        questions: [
          {
            id: "ex4-q1",
            prompt: "1) He often ________ up late.",
            choices: [{ text: "get up" }, { text: "gets up" }, { text: "got up" }, { text: "getting up" }],
            answerIndex: 1,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "'He' ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. get up → gets up.",
          },
          {
            id: "ex4-q2",
            prompt: "2) ________ you often ________ TV?",
            choices: [{ text: "Do / watch" }, { text: "Do / watches" }, { text: "Have / watch" }, { text: "Does / watches" }],
            answerIndex: 0,
            skill_tag: "ps_question_do_does",
            explainVi:
              "Câu hỏi với động từ thường: Do/Does + S + V nguyên mẫu. 'you' → Do you watch TV?",
          },
          {
            id: "ex4-q3",
            prompt: "3) Mr. Brown ________ English.",
            choices: [{ text: "speak" }, { text: "speaks" }, { text: "does speak" }, { text: "speakes" }],
            answerIndex: 1,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "Mr. Brown ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. speak → speaks.",
          },
          {
            id: "ex4-q4",
            prompt: "4) Quan usually ________ shopping on weekends.",
            choices: [{ text: "goes" }, { text: "does go" }, { text: "go" }, { text: "do" }],
            answerIndex: 0,
            skill_tag: "ps_add_es_endings",
            explainVi:
              "Quan ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. go tận cùng 'o' → goes.",
          },
          {
            id: "ex4-q5",
            prompt: "5) Quan often ________ his face at 6:15.",
            choices: [{ text: "washes" }, { text: "washing" }, { text: "does wash" }, { text: "wash" }],
            answerIndex: 0,
            skill_tag: "ps_add_es_endings",
            explainVi:
              "Quan ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. wash tận cùng 'sh' → washes.",
          },
          {
            id: "ex4-q6",
            prompt: "6) San and David always ________ a movie on Saturdays.",
            choices: [{ text: "see" }, { text: "sees" }, { text: "do see" }, { text: "does" }],
            answerIndex: 0,
            skill_tag: "ps_base_form_after_subjects",
            explainVi: "San and David = số nhiều → dùng V nguyên mẫu (không thêm -s/-es). Vì vậy chọn see.",
          },
          {
            id: "ex4-q7",
            prompt: "7) ________ Andy often ________ a bus to school?",
            choices: [{ text: "Do / take" }, { text: "Is / take" }, { text: "Does / takes" }, { text: "Does / take" }],
            answerIndex: 3,
            skill_tag: "ps_question_do_does",
            explainVi:
              "Câu hỏi hiện tại đơn: Do/Does + S + V nguyên mẫu. Andy ngôi 3 số ít → Does, và sau Does dùng take (không thêm -s).",
          },
          {
            id: "ex4-q8",
            prompt: "8) They ________ student in class 8A.",
            choices: [{ text: "are" }, { text: "is" }, { text: "do" }, { text: "eat" }],
            answerIndex: 0,
            skill_tag: "ps_to_be_forms",
            explainVi: "To be hiện tại: I am / You are / We/They are. 'They' → are.",
          },
          {
            id: "ex4-q9",
            prompt: "9) Linda ________ homework in the evenings.",
            choices: [{ text: "do not" }, { text: "does not do" }, { text: "doing" }, { text: "do" }],
            answerIndex: 1,
            skill_tag: "ps_negative_does_not",
            explainVi:
              "Phủ định hiện tại đơn: He/She/It → does not + V nguyên mẫu. Linda (số ít) → does not do.",
          },
          {
            id: "ex4-q10",
            prompt: "10) Quan usually ________ a taxi to the railway station.",
            choices: [{ text: "takes" }, { text: "take" }, { text: "taking" }, { text: "does take" }],
            answerIndex: 0,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "Quan ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. take → takes.",
          },
        ],
      },
    ],
  },
};

/**
 * THEORY BANK
 * - Same schema as PRACTICE_BANK
 * - Practice page will automatically merge PRACTICE_BANK + THEORY_BANK
 * - Theory/Concept questions are placed here so they appear before applied practice
 */
export const THEORY_BANK: PracticeBank = {
  "377daeb8-bada-47df-9c39-7a2dceea23ad": {
    lessonId: "377daeb8-bada-47df-9c39-7a2dceea23ad",
    sections: [
      {
        id: "theory-present-simple-concept-check",
        titleVi: "Câu hỏi lý thuyết: Thì hiện tại đơn",
        titleEn: "Concept Check: Present Simple",
        questions: [
          {
            id: "theory-q1",
            prompt: "1) Với chủ ngữ I / You / We / They, cấu trúc đúng ở thì hiện tại đơn là:",
            choices: [
              { text: "S + am/is/are + V" },
              { text: "S + V nguyên mẫu" },
              { text: "S + V-s / V-es" },
              { text: "S + did + V" },
            ],
            answerIndex: 1,
            skill_tag: "ps_base_form_after_subjects",
            explainVi:
              "Với I / You / We / They ở thì hiện tại đơn, ta dùng động từ nguyên mẫu, không thêm -s hoặc -es.",
          },
          {
            id: "theory-q2",
            prompt: "2) Với chủ ngữ He / She / It, cấu trúc đúng ở thì hiện tại đơn là:",
            choices: [
              { text: "S + V nguyên mẫu" },
              { text: "S + V2" },
              { text: "S + V-s / V-es" },
              { text: "S + do + V" },
            ],
            answerIndex: 2,
            skill_tag: "ps_he_she_it_adds_s",
            explainVi:
              "Với He / She / It ở thì hiện tại đơn, động từ thường thêm -s hoặc -es.",
          },
          {
            id: "theory-q3",
            prompt: "3) Theo bài học, nhóm động từ nào thường thêm -es?",
            choices: [
              { text: "Động từ kết thúc bằng o, s, x, ch, sh" },
              { text: "Động từ kết thúc bằng a, e, i, u" },
              { text: "Tất cả động từ đều thêm -es" },
              { text: "Chỉ động từ kết thúc bằng y mới thêm -es" },
            ],
            answerIndex: 0,
            skill_tag: "ps_add_es_endings",
            explainVi:
              "Các động từ kết thúc bằng o, s, x, ch, sh thường thêm -es ở ngôi 3 số ít.",
          },
          {
            id: "theory-q4",
            prompt: "4) Trong bài, “V nguyên mẫu” được hiểu là:",
            choices: [
              { text: "Động từ đã thêm -ed" },
              { text: "Động từ đã thêm -ing" },
              { text: "Động từ không thêm -s hoặc -es" },
              { text: "Động từ đứng sau “to”" },
            ],
            answerIndex: 2,
            skill_tag: "ps_base_form_meaning",
            explainVi:
              "V nguyên mẫu là động từ ở dạng cơ bản, chưa thêm -s, -es, -ed hay -ing.",
          },
          {
            id: "theory-q5",
            prompt: "5) Theo slide, thì hiện tại đơn được dùng trong mấy tình huống chính?",
            choices: [{ text: "2" }, { text: "3" }, { text: "4" }, { text: "5" }],
            answerIndex: 1,
            skill_tag: "ps_usage_overview",
            explainVi:
              "Theo bài học, thì hiện tại đơn có 3 cách dùng chính: thói quen, sự thật/chân lý, và lịch trình cố định.",
          },
          {
            id: "theory-q6",
            prompt: "6) Một trong các cách dùng chính của thì hiện tại đơn là diễn tả:",
            choices: [
              { text: "Hành động đang xảy ra ngay lúc nói" },
              { text: "Sự thật / chân lý" },
              { text: "Hành động đã kết thúc hôm qua" },
              { text: "Kế hoạch đang thay đổi" },
            ],
            answerIndex: 1,
            skill_tag: "ps_truths_and_facts",
            explainVi:
              "Thì hiện tại đơn dùng để diễn tả sự thật hiển nhiên, chân lý hoặc điều đúng nói chung.",
          },
          {
            id: "theory-q7",
            prompt: "7) Trong bài, “Mary goes to school by bicycle” là ví dụ cho cách dùng nào?",
            choices: [
              { text: "Sự thật / chân lý" },
              { text: "Thói quen" },
              { text: "Lịch trình" },
              { text: "Câu hỏi" },
            ],
            answerIndex: 1,
            skill_tag: "ps_habits",
            explainVi:
              "Câu này diễn tả việc Mary đi học bằng xe đạp như một thói quen lặp lại.",
          },
          {
            id: "theory-q8",
            prompt: "8) Trong bài, “The train leaves at 8 tomorrow” là ví dụ của:",
            choices: [
              { text: "Hành động đang diễn ra" },
              { text: "Thói quen" },
              { text: "Lịch trình cố định" },
              { text: "Câu phủ định" },
            ],
            answerIndex: 2,
            skill_tag: "ps_fixed_schedule",
            explainVi:
              "Thì hiện tại đơn có thể dùng cho lịch trình cố định như giờ tàu chạy, giờ học, giờ mở cửa.",
          },
          {
            id: "theory-q9",
            prompt: "9) Thứ tự đúng của trạng từ tần suất từ ít đến nhiều là:",
            choices: [
              { text: "always → usually → often → sometimes → rarely → never" },
              { text: "never → rarely → sometimes → often → usually → always" },
              { text: "rarely → never → often → usually → sometimes → always" },
              { text: "sometimes → often → rarely → usually → never → always" },
            ],
            answerIndex: 1,
            skill_tag: "ps_frequency_order",
            explainVi:
              "Thứ tự từ ít đến nhiều là: never → rarely → sometimes → often → usually → always.",
          },
          {
            id: "theory-q10",
            prompt: "10) Theo bài học, trạng từ tần suất đứng ở đâu với động từ thường?",
            choices: [
              { text: "Trước động từ thường" },
              { text: "Sau động từ thường" },
              { text: "Cuối câu" },
              { text: "Đầu câu bắt buộc" },
            ],
            answerIndex: 0,
            skill_tag: "ps_adverb_position_regular_verbs",
            explainVi:
              "Với động từ thường, trạng từ tần suất thường đứng trước động từ, ví dụ: She often goes to school.",
          },
          {
            id: "theory-q11",
            prompt: "11) Theo bài học, trạng từ tần suất đứng ở đâu với động từ to be?",
            choices: [
              { text: "Trước chủ ngữ" },
              { text: "Sau động từ to be" },
              { text: "Trước danh từ" },
              { text: "Cuối đoạn văn" },
            ],
            answerIndex: 1,
            skill_tag: "ps_adverb_position_to_be",
            explainVi:
              "Với động từ to be, trạng từ tần suất thường đứng sau to be, ví dụ: She is always kind.",
          },
          {
            id: "theory-q12",
            prompt: "12) Với động từ thường, dạng phủ định đúng cho I / You / We / They là:",
            choices: [
              { text: "do not + V nguyên mẫu" },
              { text: "does not + V nguyên mẫu" },
              { text: "not + V-s/es" },
              { text: "do not + V-s/es" },
            ],
            answerIndex: 0,
            skill_tag: "ps_negative_do_not",
            explainVi:
              "Với I / You / We / They, phủ định ở hiện tại đơn là do not + động từ nguyên mẫu.",
          },
          {
            id: "theory-q13",
            prompt: "13) Với động từ thường, dạng phủ định đúng cho He / She / It là:",
            choices: [
              { text: "do not + V nguyên mẫu" },
              { text: "does not + V nguyên mẫu" },
              { text: "not + V-s/es" },
              { text: "does not + V-s/es" },
            ],
            answerIndex: 1,
            skill_tag: "ps_negative_does_not",
            explainVi:
              "Với He / She / It, phủ định ở hiện tại đơn là does not + động từ nguyên mẫu.",
          },
          {
            id: "theory-q14",
            prompt: "14) Với động từ đặc biệt như be, can, will, cách tạo phủ định là:",
            choices: [
              { text: "thêm do vào trước động từ" },
              { text: "thêm does vào trước động từ" },
              { text: "thêm not ngay sau động từ đó" },
              { text: "thêm -s vào động từ" },
            ],
            answerIndex: 2,
            skill_tag: "ps_negative_special_verbs",
            explainVi:
              "Với be, can, will..., ta tạo phủ định bằng cách thêm not ngay sau động từ đó.",
          },
          {
            id: "theory-q15",
            prompt: "15) Với động từ thường, công thức câu hỏi đúng là:",
            choices: [
              { text: "Do/Does + S + V nguyên mẫu?" },
              { text: "Do/Does + S + V-s/es?" },
              { text: "Is/Are + S + V nguyên mẫu?" },
              { text: "S + do/does + V nguyên mẫu?" },
            ],
            answerIndex: 0,
            skill_tag: "ps_question_do_does",
            explainVi:
              "Câu hỏi với động từ thường ở hiện tại đơn dùng Do/Does + chủ ngữ + động từ nguyên mẫu.",
          },
          {
            id: "theory-q16",
            prompt: "16) Với động từ đặc biệt như be, can, will, cách tạo câu hỏi là:",
            choices: [
              { text: "thêm do/does vào đầu câu" },
              { text: "đưa động từ đó lên đầu câu" },
              { text: "thêm not vào cuối câu" },
              { text: "giữ nguyên trật tự câu kể" },
            ],
            answerIndex: 1,
            skill_tag: "ps_question_special_verbs",
            explainVi:
              "Với be, can, will..., ta tạo câu hỏi bằng cách đưa chính động từ đó lên đầu câu.",
          },
        ],
      },
    ],
  },
};