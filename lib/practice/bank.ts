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
            explainVi:
              "Hiện tại đơn: ngôi 3 số ít (He/She/It/Linh) → V-s hoặc -es. Không thuộc s, sh, ch, o, x → thêm -s: works.",
          },
          {
            id: "ex1-q2",
            prompt: "2) Cat (like) ________ fish.",
            choices: [{ text: "like" }, { text: "likes" }, { text: "liked" }, { text: "liking" }],
            answerIndex: 1,
            explainVi:
              "Ngôi 3 số ít (Cat) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'like' không thuộc nhóm -es → likes.",
          },
          {
            id: "ex1-q3",
            prompt: "3) Myan (live) ________ in California.",
            choices: [{ text: "live" }, { text: "lives" }, { text: "lived" }, { text: "living" }],
            answerIndex: 1,
            explainVi:
              "Ngôi 3 số ít (Myan) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'live' không thuộc nhóm -es → lives.",
          },
          {
            id: "ex1-q4",
            prompt: "4) It (rain) ________ almost every afternoon in French.",
            choices: [{ text: "rain" }, { text: "rains" }, { text: "rained" }, { text: "raining" }],
            answerIndex: 1,
            explainVi:
              "'It' là ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'rain' → thêm -s: rains.",
          },
          {
            id: "ex1-q5",
            prompt: "5) My son (fry) ________ eggs for breakfast everyday.",
            choices: [{ text: "fry" }, { text: "fries" }, { text: "fried" }, { text: "frying" }],
            answerIndex: 1,
            explainVi:
              "Ngôi 3 số ít (my son) → chia hiện tại đơn. Động từ tận cùng phụ âm + y → đổi y → ies: fry → fries.",
          },
          {
            id: "ex1-q6",
            prompt: "6) The museum (close) ________ at 8 pm.",
            choices: [{ text: "close" }, { text: "closes" }, { text: "closed" }, { text: "closing" }],
            answerIndex: 1,
            explainVi:
              "Ngôi 3 số ít (the museum) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'close' → closes.",
          },
          {
            id: "ex1-q7a",
            prompt: "7) He (try) ________ hard in class, ...",
            choices: [{ text: "try" }, { text: "tries" }, { text: "tried" }, { text: "trying" }],
            answerIndex: 1,
            explainVi:
              "'He' ngôi 3 số ít → chia hiện tại đơn. try tận cùng phụ âm + y → đổi y → ies: try → tries.",
          },
          {
            id: "ex1-q7b",
            prompt: "7) ... but I (not think) ________ he'll pass.",
            choices: [{ text: "don’t think" }, { text: "am not think" }, { text: "doesn’t think" }, { text: "didn’t think" }],
            answerIndex: 0,
            explainVi:
              "Phủ định hiện tại đơn với động từ thường: I/You/We/They → do not + V nguyên mẫu. 'I' → don’t think.",
          },
          {
            id: "ex1-q8",
            prompt: "8) ... she (pass) ________ every exam without even trying.",
            choices: [{ text: "pass" }, { text: "passes" }, { text: "passed" }, { text: "passing" }],
            answerIndex: 1,
            explainVi:
              "'She' ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. pass tận cùng 'ss' → passes.",
          },
          {
            id: "ex1-q9a",
            prompt: "9) Your life (be) _____ so boring.",
            choices: [{ text: "are" }, { text: "is" }, { text: "am" }, { text: "were" }],
            answerIndex: 1,
            explainVi:
              "Động từ to be hiện tại: I am / You are / He-She-It (số ít) is. 'Your life' số ít → is.",
          },
          {
            id: "ex1-q9b",
            prompt: "9) You just (watch) ________ TV everyday.",
            choices: [{ text: "watches" }, { text: "watch" }, { text: "watched" }, { text: "watching" }],
            answerIndex: 1,
            explainVi:
              "Hiện tại đơn: I/You/We/They + V nguyên mẫu (không thêm -s/-es). 'You' → watch.",
          },
          {
            id: "ex1-q10",
            prompt: "10) His girlfriend (write) ________ to him two times a week.",
            choices: [{ text: "write" }, { text: "writes" }, { text: "wrote" }, { text: "writing" }],
            answerIndex: 1,
            explainVi:
              "Ngôi 3 số ít (his girlfriend) → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. 'write' → writes.",
          },
          {
            id: "ex1-q11",
            prompt: "11) You (speak) ________ English?",
            choices: [{ text: "Are you speak" }, { text: "Do you speak" }, { text: "Does you speak" }, { text: "Did you speak" }],
            answerIndex: 1,
            explainVi:
              "Câu hỏi với động từ thường (hiện tại đơn): Do/Does + S + V nguyên mẫu. 'You' → Do you speak?",
          },
          {
            id: "ex1-q12",
            prompt: "12) She (not live) ________ in Ho Chi Minh city.",
            choices: [{ text: "don’t live" }, { text: "doesn’t live" }, { text: "didn’t live" }, { text: "isn’t live" }],
            answerIndex: 1,
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
            explainVi:
              "To be hiện tại: I am / You are / He-She-It (số ít) is. 'His cat' số ít → is.",
          },
          {
            id: "ex2-q2",
            prompt: "2) Linh ________ a student.",
            choices: [{ text: "am" }, { text: "is" }, { text: "are" }, { text: "be" }],
            answerIndex: 1,
            explainVi:
              "Tên riêng 1 người = số ít → dùng 'is' (I am / You are / He-She-It is). Linh → is.",
          },
          {
            id: "ex2-q3",
            prompt: "3) They _________ ready to get a pet.",
            choices: [{ text: "is" }, { text: "am" }, { text: "are" }, { text: "be" }],
            answerIndex: 2,
            explainVi:
              "'They' là số nhiều → dùng 'are' (I am / You are / We/They are).",
          },
          {
            id: "ex2-q4",
            prompt: "4) My life _____ so boring.",
            choices: [{ text: "are" }, { text: "am" }, { text: "is" }, { text: "be" }],
            answerIndex: 2,
            explainVi:
              "'My life' số ít → dùng 'is' (He/She/It is).",
          },
          {
            id: "ex2-q5a",
            prompt: "5) Her husband ________ from China.",
            choices: [{ text: "are" }, { text: "is" }, { text: "am" }, { text: "be" }],
            answerIndex: 1,
            explainVi:
              "'Her husband' số ít → dùng 'is'.",
          },
          {
            id: "ex2-q5b",
            prompt: "5) She _______ from Viet Nam.",
            choices: [{ text: "are" }, { text: "is" }, { text: "am" }, { text: "be" }],
            answerIndex: 1,
            explainVi:
              "'She' → dùng 'is' (I am / You are / She is).",
          },
          {
            id: "ex2-q6",
            prompt: "6) They ____________ (not/be) late.",
            choices: [{ text: "isn’t" }, { text: "aren’t" }, { text: "don’t be" }, { text: "doesn’t be" }],
            answerIndex: 1,
            explainVi:
              "Phủ định với 'to be': thêm 'not' sau be. They are not → aren’t.",
          },
          {
            id: "ex2-q7",
            prompt: "7) I and my sister (be)________ good friends.",
            choices: [{ text: "is" }, { text: "am" }, { text: "are" }, { text: "be" }],
            answerIndex: 2,
            explainVi:
              "“I and my sister” = 2 người → chủ ngữ số nhiều → dùng 'are'.",
          },
          {
            id: "ex2-q8",
            prompt: "8) ___________ (she/be) a doctor?",
            choices: [{ text: "Are she" }, { text: "Is she" }, { text: "Does she is" }, { text: "She is" }],
            answerIndex: 1,
            explainVi:
              "Câu hỏi với 'to be': đưa be lên đầu câu. She → Is she a doctor?",
          },
          {
            id: "ex2-q9",
            prompt: "9) Her sister (be) _________ 9 years old.",
            choices: [{ text: "are" }, { text: "am" }, { text: "is" }, { text: "be" }],
            answerIndex: 2,
            explainVi:
              "'Her sister' số ít → dùng 'is'.",
          },
          {
            id: "ex2-q10",
            prompt: "10) Max and Lan (be)__________ my cats.",
            choices: [{ text: "is" }, { text: "am" }, { text: "are" }, { text: "be" }],
            answerIndex: 2,
            explainVi:
              "“Max and Lan” = 2 người → số nhiều → dùng 'are'.",
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
            explainVi:
              "Cụm đúng: play + môn thể thao (play handball). Các đáp án khác không hợp nghĩa/collocation.",
          },
          {
            id: "ex3-q2",
            prompt: "2) They never _____________ tea.",
            choices: [{ text: "do" }, { text: "take" }, { text: "drink" }, { text: "speak" }],
            answerIndex: 2,
            explainVi:
              "Cụm đúng: drink tea = uống trà. 'never' chỉ thói quen → dùng hiện tại đơn.",
          },
          {
            id: "ex3-q3",
            prompt: "3) The swimming pool _____________ at 6:30 in the morning.",
            choices: [{ text: "close" }, { text: "take" }, { text: "opens" }, { text: "plays" }],
            answerIndex: 2,
            explainVi:
              "Lịch trình cố định → hiện tại đơn. Chủ ngữ số ít → V-s hoặc -es; 'open' không thuộc s, sh, ch, o, x → opens.",
          },
          {
            id: "ex3-q4",
            prompt: "4) It _____________ at 7 pm in the evening.",
            choices: [{ text: "open" }, { text: "wake up" }, { text: "closes" }, { text: "speak" }],
            answerIndex: 2,
            explainVi:
              "Lịch trình → hiện tại đơn. 'It' ngôi 3 số ít → V-s hoặc -es; 'close' → closes (tận cùng s → thêm -es).",
          },
          {
            id: "ex3-q5",
            prompt: "5) Bad driving _____________ many accidents.",
            choices: [{ text: "take" }, { text: "play" }, { text: "causes" }, { text: "opens" }],
            answerIndex: 2,
            explainVi:
              "Sự thật chung → hiện tại đơn. Chủ ngữ số ít → V-s hoặc -es; 'cause' → causes (tận cùng s → thêm -es).",
          },
          {
            id: "ex3-q6",
            prompt: "6) Her parents _____________ in a very small flat.",
            choices: [{ text: "do" }, { text: "speak" }, { text: "live" }, { text: "drink" }],
            answerIndex: 2,
            explainVi:
              "'Her parents' số nhiều → dùng V nguyên mẫu (không thêm -s/-es). Động từ đúng theo nghĩa: live.",
          },
          {
            id: "ex3-q7",
            prompt: "7) The Olympic Games _____________ place every four years.",
            choices: [{ text: "do" }, { text: "take" }, { text: "play" }, { text: "open" }],
            answerIndex: 1,
            explainVi:
              "Cụm cố định: take place = diễn ra. 'do/play/open place' sai collocation.",
          },
          {
            id: "ex3-q8",
            prompt: "8) They always _____________ their homework.",
            choices: [{ text: "take" }, { text: "play" }, { text: "do" }, { text: "drink" }],
            answerIndex: 2,
            explainVi:
              "Cụm đúng: do homework. 'always' chỉ thói quen → hiện tại đơn.",
          },
          {
            id: "ex3-q9",
            prompt: "9) The students _____________ a little English.",
            choices: [{ text: "do" }, { text: "drink" }, { text: "speak" }, { text: "open" }],
            answerIndex: 2,
            explainVi:
              "Cụm đúng: speak English = nói tiếng Anh. Chủ ngữ số nhiều → V nguyên mẫu.",
          },
          {
            id: "ex3-q10",
            prompt: "10) I always _____________ late in the morning.",
            choices: [{ text: "take" }, { text: "wake up" }, { text: "open" }, { text: "cause" }],
            answerIndex: 1,
            explainVi:
              "Cụm đúng: wake up = thức dậy. 'always' chỉ thói quen → hiện tại đơn.",
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
            explainVi:
              "'He' ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. get up → gets up.",
          },
          {
            id: "ex4-q2",
            prompt: "2) ________ you often ________ TV?",
            choices: [{ text: "Do / watch" }, { text: "Do / watches" }, { text: "Have / watch" }, { text: "Does / watches" }],
            answerIndex: 0,
            explainVi:
              "Câu hỏi với động từ thường: Do/Does + S + V nguyên mẫu. 'you' → Do you watch TV?",
          },
          {
            id: "ex4-q3",
            prompt: "3) Mr. Brown ________ English.",
            choices: [{ text: "speak" }, { text: "speaks" }, { text: "does speak" }, { text: "speakes" }],
            answerIndex: 1,
            explainVi:
              "Mr. Brown ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. speak → speaks.",
          },
          {
            id: "ex4-q4",
            prompt: "4) Quan usually ________ shopping on weekends.",
            choices: [{ text: "goes" }, { text: "does go" }, { text: "go" }, { text: "do" }],
            answerIndex: 0,
            explainVi:
              "Quan ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. go tận cùng 'o' → goes.",
          },
          {
            id: "ex4-q5",
            prompt: "5) Quan often ________ his face at 6:15.",
            choices: [{ text: "washes" }, { text: "washing" }, { text: "does wash" }, { text: "wash" }],
            answerIndex: 0,
            explainVi:
              "Quan ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. wash tận cùng 'sh' → washes.",
          },
          {
            id: "ex4-q6",
            prompt: "6) San and David always ________ a movie on Saturdays.",
            choices: [{ text: "see" }, { text: "sees" }, { text: "do see" }, { text: "does" }],
            answerIndex: 0,
            explainVi:
              "San and David = số nhiều → dùng V nguyên mẫu (không thêm -s/-es). Vì vậy chọn see.",
          },
          {
            id: "ex4-q7",
            prompt: "7) ________ Andy often ________ a bus to school?",
            choices: [{ text: "Do / take" }, { text: "Is / take" }, { text: "Does / takes" }, { text: "Does / take" }],
            answerIndex: 3,
            explainVi:
              "Câu hỏi hiện tại đơn: Do/Does + S + V nguyên mẫu. Andy ngôi 3 số ít → Does, và sau Does dùng take (không thêm -s).",
          },
          {
            id: "ex4-q8",
            prompt: "8) They ________ student in class 8A.",
            choices: [{ text: "are" }, { text: "is" }, { text: "do" }, { text: "eat" }],
            answerIndex: 0,
            explainVi:
              "To be hiện tại: I am / You are / We/They are. 'They' → are.",
          },
          {
            id: "ex4-q9",
            prompt: "9) Linda ________ homework in the evenings.",
            choices: [{ text: "do not" }, { text: "does not do" }, { text: "doing" }, { text: "do" }],
            answerIndex: 1,
            explainVi:
              "Phủ định hiện tại đơn: He/She/It → does not + V nguyên mẫu. Linda (số ít) → does not do.",
          },
          {
            id: "ex4-q10",
            prompt: "10) Quan usually ________ a taxi to the railway station.",
            choices: [{ text: "takes" }, { text: "take" }, { text: "taking" }, { text: "does take" }],
            answerIndex: 0,
            explainVi:
              "Quan ngôi 3 số ít → V-s hoặc -es; nếu tận cùng s, sh, ch, o, x thì -es. take → takes.",
          },
        ],
      },
    ],
  },
};