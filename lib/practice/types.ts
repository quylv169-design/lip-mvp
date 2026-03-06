// lib/practice/types.ts

export type PracticeChoice = {
  text: string; // text hiển thị cho đáp án
};

export type PracticeQuestion = {
  id: string;
  prompt: string; // câu hỏi
  choices: PracticeChoice[]; // 4 đáp án
  answerIndex: number; // index đáp án đúng (0..3)
  explainVi?: string; // giải thích tiếng Việt (optional)
  skill_tag?: string; // tag kỹ năng để tracking analytics / AI feedback
};

export type PracticeSection = {
  id: string;
  titleVi: string;
  titleEn: string;
  questions: PracticeQuestion[];
};

export type PracticeLessonBank = {
  lessonId: string; // UUID của lessons.id
  sections: PracticeSection[];
};

// Bank tổng theo lessonId
export type PracticeBank = Record<string, PracticeLessonBank>;