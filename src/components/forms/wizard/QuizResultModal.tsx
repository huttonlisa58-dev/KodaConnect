'use client';

import { CheckCircle, XCircle, RefreshCw, ChevronRight, BookOpen, ChevronDown } from 'lucide-react';
import { ExamGradeResult } from '@/lib/exam-grading';

interface QuizResultModalProps {
  result: ExamGradeResult;
  sectionLabel: string;
  /** Tutorial content for retake study material */
  retakeTutorial?: { title: string; content: string }[];
  /** Whether retakes are allowed */
  retakeEnabled?: boolean;
  /** Called when user wants to proceed to next section (only shown on pass) */
  onContinue: () => void;
  /** Called when user wants to retake the quiz (only shown on fail + retake enabled) */
  onRetake: () => void;
  /** Brand color */
  brandColor?: string;
}

/**
 * Full-screen modal shown after a quiz section is graded inline.
 * Shows score, pass/fail, and either a "Continue" button (pass) or
 * study material + retake button (fail).
 */
export function QuizResultModal({
  result,
  sectionLabel,
  retakeTutorial = [],
  retakeEnabled = true,
  onContinue,
  onRetake,
  brandColor = '#0f766e',
}: QuizResultModalProps) {
  const scoreColor = result.passed ? '#15803d' : '#dc2626';
  const scoreBg = result.passed ? '#f0fdf4' : '#fef2f2';
  const scoreBorder = result.passed ? '#bbf7d0' : '#fecaca';
  const iconBg = result.passed ? '#dcfce7' : '#fee2e2';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8fafb' }}>
      <div className="max-w-2xl mx-auto p-4 py-8 space-y-6">
        {/* Score Card */}
        <div
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: scoreBg, border: `2px solid ${scoreBorder}` }}
        >
          {/* Icon */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: iconBg }}
          >
            {result.passed ? (
              <CheckCircle className="w-8 h-8 text-green-600" />
            ) : (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
          </div>

          {/* Section Label */}
          <p className="text-sm text-gray-500 mb-2">{sectionLabel}</p>

          {/* Big Score */}
          <div className="mb-3">
            <span className="text-5xl font-bold" style={{ color: scoreColor }}>
              {result.scorePercent}%
            </span>
          </div>

          {/* Pass / Fail */}
          <div className="mb-4">
            {result.passed ? (
              <span className="text-lg font-semibold text-green-700">Quiz Passed!</span>
            ) : (
              <span className="text-lg font-semibold text-red-700">
                {result.scorePercent < result.passingScore
                  ? `You need ${result.passingScore}% to pass`
                  : 'Did Not Pass'}
              </span>
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-white/80 rounded-xl p-3">
              <div className="text-2xl font-bold text-green-600">{result.correctCount}</div>
              <div className="text-gray-500">Correct</div>
            </div>
            <div className="bg-white/80 rounded-xl p-3">
              <div className="text-2xl font-bold text-red-600">{result.incorrectCount}</div>
              <div className="text-gray-500">Incorrect</div>
            </div>
            <div className="bg-white/80 rounded-xl p-3">
              <div className="text-2xl font-bold text-gray-600">{result.totalQuestions}</div>
              <div className="text-gray-500">Total</div>
            </div>
          </div>

          <p className="text-sm text-gray-500 mt-3">
            Passing score: {result.passingScore}% ({Math.ceil(result.totalQuestions * result.passingScore / 100)} of {result.totalQuestions} correct)
          </p>
        </div>

        {/* Pass: Continue Button */}
        {result.passed && (
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Great job! You can now continue to the next section.
            </p>
            <button
              onClick={onContinue}
              className="inline-flex items-center gap-2 px-8 py-3.5 text-white rounded-xl font-semibold hover:opacity-90 shadow-md transition-opacity"
              style={{ backgroundColor: brandColor }}
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Fail: Study Material + Retake */}
        {!result.passed && retakeEnabled && (
          <>
            {/* Study Material */}
            {retakeTutorial.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div
                  className="px-5 py-3 text-white flex items-center gap-3"
                  style={{ backgroundColor: brandColor }}
                >
                  <BookOpen className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <h2 className="font-semibold">Review Key Concepts</h2>
                    <p className="text-sm opacity-80">Study these before retaking</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {retakeTutorial.map((section, idx) => (
                    <details key={idx} className="group">
                      <summary className="px-5 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-50 transition-colors list-none">
                        <span className="font-medium text-gray-800 text-sm flex items-center gap-2">
                          <span
                            className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold"
                            style={{ backgroundColor: brandColor }}
                          >
                            {idx + 1}
                          </span>
                          {section.title}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="px-5 pb-4 pl-14">
                        <p className="text-sm text-gray-600 leading-relaxed">{section.content}</p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Retake Button */}
            <div className="text-center">
              <button
                onClick={onRetake}
                className="inline-flex items-center gap-2 px-8 py-3.5 text-white rounded-xl font-semibold hover:opacity-90 shadow-md transition-opacity"
                style={{ backgroundColor: brandColor }}
              >
                <RefreshCw className="w-4 h-4" />
                Retake Quiz
              </button>
              <p className="text-xs text-gray-400 mt-3">
                Your previous answers will be cleared so you can try again.
              </p>
            </div>
          </>
        )}

        {/* Fail: No retake allowed */}
        {!result.passed && !retakeEnabled && (
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Please contact your supervisor for further instructions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
