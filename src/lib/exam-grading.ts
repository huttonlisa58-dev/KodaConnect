/**
 * Exam Grading Utility
 *
 * Grades exam submissions against an answer key stored in form_definitions.metadata.
 * Used by both the caregiver-facing ReviewStep (post-submission) and
 * the office submission detail page.
 *
 * Supports two answer key formats:
 *   Format A (numeric keys):     { "1": "c", "2": "c", ... }
 *   Format B (field ID keys):    { "competency_q1": "b", "competency_q2": "b", ... }
 *
 * Supports two field ID patterns:
 *   Pattern A (double underscore): "pca_test__q1"   → matches /__q(\d+)$/
 *   Pattern B (single underscore): "competency_q1"  → matches /_q(\d+)$/
 *
 * Expected metadata shape on form_definitions:
 *   metadata.auto_grade: true
 *   metadata.passing_score: 80  (percent)
 *   metadata.total_questions: 110
 *   metadata.answer_key: { ... }
 *   metadata.answer_explanations: { "competency_q1": "...", ... }  (optional)
 *
 * Expected field shape:
 *   field.field_id: "pca_test__q1" or "competency_q1"
 *   field.correct_answer: "c"  (optional — answer_key is primary source)
 */

export interface ExamGradeResult {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  scorePercent: number;
  passingScore: number;
  passed: boolean;
  /** Per-question results keyed by field_id */
  details: Record<string, {
    questionNumber: number;
    label: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    /** Optional explanation of why the correct answer is right */
    explanation?: string;
  }>;
}

/**
 * Grade an exam submission against the answer key.
 *
 * @param metadata  - form_definitions.metadata (must contain auto_grade, answer_key, etc.)
 * @param sections  - form_definitions.sections (to find fields with correct_answer)
 * @param submissionData - the flat key-value submission data
 */
/**
 * Grade a single quiz section (identified by section_group key) against the answer key.
 * Used for inline per-section grading in sequential training courses.
 *
 * @param sectionGroupKey - The section_group value to filter quiz fields by
 * @param metadata        - form_definitions.metadata (must contain auto_grade, answer_key)
 * @param sections        - form_definitions.sections (all sections, will be filtered)
 * @param submissionData  - the flat key-value submission data
 */
export function gradeQuizSection(
  sectionGroupKey: string,
  metadata: Record<string, any>,
  sections: any[],
  submissionData: Record<string, any>
): ExamGradeResult | null {
  if (!metadata?.auto_grade || !metadata?.answer_key) {
    return null;
  }

  // Filter sections to only those in the given section_group that have quiz fields
  const quizSections = sections.filter((s: any) => {
    if (s.section_group !== sectionGroupKey) return false;
    // Must have fields with _q pattern (quiz questions)
    return s.fields?.some((f: any) => {
      const fid = f.field_id || f.id;
      return /_q\d+/.test(fid);
    });
  });

  if (quizSections.length === 0) return null;

  const answerKey: Record<string, string> = metadata.answer_key;
  const answerExplanations: Record<string, string> = metadata.answer_explanations || {};
  const passingScore: number = metadata.passing_score ?? 70;

  const questionFields: {
    fieldId: string;
    questionNumber: number;
    label: string;
    correctAnswer: string;
    explanation?: string;
  }[] = [];

  for (const section of quizSections) {
    if (!section.fields) continue;
    for (const field of section.fields) {
      const fid: string = field.field_id || field.id;
      const match = fid.match(/_q(\d+[a-c]?)$/);
      if (match) {
        const qSuffix = match[1];
        const qNum = parseInt(qSuffix, 10);
        const correctFromField = (field as any).correct_answer;
        const correctFromKey = answerKey[String(qNum)] || answerKey[fid] || answerKey[`q${qSuffix}`] || '';
        // Look up explanation by field ID, then by numeric key, then by q-prefix
        const explanation = answerExplanations[fid] || answerExplanations[String(qNum)] || answerExplanations[`q${qSuffix}`] || '';
        questionFields.push({
          fieldId: fid,
          questionNumber: qNum,
          label: field.label || `Question ${qSuffix}`,
          correctAnswer: correctFromField || correctFromKey || '',
          explanation: explanation || undefined,
        });
      }
    }
  }

  if (questionFields.length === 0) return null;

  questionFields.sort((a, b) => a.questionNumber - b.questionNumber);

  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  const details: ExamGradeResult['details'] = {};

  for (const q of questionFields) {
    const userAnswer = submissionData[q.fieldId];
    const answered = userAnswer !== undefined && userAnswer !== null && userAnswer !== '';
    const isCorrect = answered && String(userAnswer).toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();

    if (!answered) {
      unansweredCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }

    details[q.fieldId] = {
      questionNumber: q.questionNumber,
      label: q.label,
      userAnswer: answered ? String(userAnswer) : '',
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation,
    };
  }

  const totalQuestions = questionFields.length;
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return {
    totalQuestions,
    correctCount,
    incorrectCount,
    unansweredCount,
    scorePercent,
    passingScore,
    passed: scorePercent >= passingScore,
    details,
  };
}

export function gradeExam(
  metadata: Record<string, any>,
  sections: any[],
  submissionData: Record<string, any>
): ExamGradeResult | null {
  if (!metadata?.auto_grade || !metadata?.answer_key) {
    return null;
  }

  const answerKey: Record<string, string> = metadata.answer_key;
  const answerExplanations: Record<string, string> = metadata.answer_explanations || {};
  const passingScore: number = metadata.passing_score ?? 70;
  const totalFromMeta: number = metadata.total_questions ?? Object.keys(answerKey).length;

  // Collect all question fields from sections
  const questionFields: {
    fieldId: string;
    questionNumber: number;
    label: string;
    correctAnswer: string;
    explanation?: string;
  }[] = [];

  for (const section of sections) {
    if (!section.fields) continue;
    for (const field of section.fields) {
      const fid: string = field.field_id || field.id;
      // Match fields with double underscore: "pca_test__q1", "pca_test__q42"
      // OR single underscore: "competency_q1", "competency_q42"
      const match = fid.match(/_q(\d+[a-c]?)$/);
      if (match) {
        const qSuffix = match[1]; // e.g., "1", "42", "66a"
        const qNum = parseInt(qSuffix, 10); // numeric portion for sorting
        const correctFromField = (field as any).correct_answer;
        // Look up answer key by: numeric key ("1"), full field ID ("competency_q1"), or suffix ("q1")
        const correctFromKey = answerKey[String(qNum)] || answerKey[fid] || answerKey[`q${qSuffix}`] || '';
        // Look up explanation by field ID, then by numeric key, then by q-prefix
        const explanation = answerExplanations[fid] || answerExplanations[String(qNum)] || answerExplanations[`q${qSuffix}`] || '';
        questionFields.push({
          fieldId: fid,
          questionNumber: qNum,
          label: field.label || `Question ${qSuffix}`,
          correctAnswer: correctFromField || correctFromKey || '',
          explanation: explanation || undefined,
        });
      }
    }
  }

  // Sort by question number
  questionFields.sort((a, b) => a.questionNumber - b.questionNumber);

  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  const details: ExamGradeResult['details'] = {};

  for (const q of questionFields) {
    const userAnswer = submissionData[q.fieldId];
    const answered = userAnswer !== undefined && userAnswer !== null && userAnswer !== '';
    const isCorrect = answered && String(userAnswer).toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();

    if (!answered) {
      unansweredCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }

    details[q.fieldId] = {
      questionNumber: q.questionNumber,
      label: q.label,
      userAnswer: answered ? String(userAnswer) : '',
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation,
    };
  }

  const totalQuestions = questionFields.length || totalFromMeta;
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return {
    totalQuestions,
    correctCount,
    incorrectCount,
    unansweredCount,
    scorePercent,
    passingScore,
    passed: scorePercent >= passingScore,
    details,
  };
}
