'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react';
import { ExamGradeResult } from '@/lib/exam-grading';

interface ExamGradeDisplayProps {
  result: ExamGradeResult;
  /** Show the detailed per-question breakdown (office view) */
  showDetails?: boolean;
  /** Brand color for styling */
  brandColor?: string;
}

/**
 * Displays exam grading results.
 *
 * Two modes:
 * - Caregiver view (showDetails=false): Shows score, pass/fail, and summary counts.
 * - Office view (showDetails=true): Also shows expandable per-question breakdown
 *   with correct/incorrect indicators, the right answers for missed questions,
 *   and answer explanations (scoring guide) when available.
 */
export function ExamGradeDisplay({
  result,
  showDetails = false,
  brandColor = '#0f766e',
}: ExamGradeDisplayProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [showExplanations, setShowExplanations] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'incorrect' | 'unanswered'>('all');

  const scoreColor = result.passed ? '#15803d' : '#dc2626';
  const scoreBg = result.passed ? '#f0fdf4' : '#fef2f2';
  const scoreBorder = result.passed ? '#bbf7d0' : '#fecaca';

  // Check if any explanations exist
  const hasExplanations = Object.values(result.details).some(q => q.explanation);

  // Filter questions based on mode
  const filteredQuestions = Object.values(result.details)
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .filter(q => {
      if (filterMode === 'incorrect') return !q.isCorrect && q.userAnswer;
      if (filterMode === 'unanswered') return !q.userAnswer;
      return true;
    });

  return (
    <div className="space-y-4">
      {/* Score Card */}
      <div
        className="rounded-2xl p-6 text-center"
        style={{ backgroundColor: scoreBg, border: `2px solid ${scoreBorder}` }}
      >
        {/* Big Score */}
        <div className="mb-3">
          <span className="text-5xl font-bold" style={{ color: scoreColor }}>
            {result.scorePercent}%
          </span>
        </div>

        {/* Pass / Fail Badge */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {result.passed ? (
            <>
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-lg font-semibold text-green-700">PASSED</span>
            </>
          ) : (
            <>
              <XCircle className="w-6 h-6 text-red-600" />
              <span className="text-lg font-semibold text-red-700">DID NOT PASS</span>
            </>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
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

        {/* Passing threshold note */}
        <p className="text-sm text-gray-500 mt-3">
          Passing score: {result.passingScore}% ({Math.ceil(result.totalQuestions * result.passingScore / 100)} of {result.totalQuestions} correct)
        </p>

        {result.unansweredCount > 0 && (
          <div className="flex items-center justify-center gap-1 mt-2 text-sm text-amber-600">
            <AlertTriangle className="w-4 h-4" />
            <span>{result.unansweredCount} question{result.unansweredCount !== 1 ? 's' : ''} unanswered</span>
          </div>
        )}
      </div>

      {/* Detailed Breakdown (office view) */}
      {showDetails && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium text-gray-700">
              Question-by-Question Breakdown
              {hasExplanations && (
                <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Scoring Guide
                </span>
              )}
            </span>
            {detailsExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {detailsExpanded && (
            <>
              {/* Filter bar & explanation toggle */}
              <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      filterMode === 'all'
                        ? 'bg-gray-700 text-white'
                        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    All ({result.totalQuestions})
                  </button>
                  {result.incorrectCount > 0 && (
                    <button
                      onClick={() => setFilterMode('incorrect')}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        filterMode === 'incorrect'
                          ? 'bg-red-600 text-white'
                          : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'
                      }`}
                    >
                      Incorrect ({result.incorrectCount})
                    </button>
                  )}
                  {result.unansweredCount > 0 && (
                    <button
                      onClick={() => setFilterMode('unanswered')}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        filterMode === 'unanswered'
                          ? 'bg-amber-600 text-white'
                          : 'bg-white text-amber-600 border border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      Unanswered ({result.unansweredCount})
                    </button>
                  )}
                </div>
                {hasExplanations && (
                  <button
                    onClick={() => setShowExplanations(!showExplanations)}
                    className={`flex items-center gap-1 px-3 py-1 text-xs rounded-full transition-colors ${
                      showExplanations
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <Info className="w-3 h-3" />
                    Explanations
                  </button>
                )}
              </div>

              <div className="border-t border-gray-200 max-h-[600px] overflow-y-auto">
                {filteredQuestions.map((q) => (
                  <div
                    key={q.questionNumber}
                    className={`px-4 py-3 border-b border-gray-100 last:border-0 ${
                      !q.isCorrect ? 'bg-red-50/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className="pt-0.5 flex-shrink-0">
                        {q.isCorrect ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : q.userAnswer ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                        )}
                      </div>

                      {/* Question info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700">
                          Q{q.questionNumber}
                          {q.label && (
                            <span className="ml-1 text-gray-500 text-xs">
                              — {q.label.replace(/^\d+\.\s*/, '').substring(0, 80)}
                              {q.label.replace(/^\d+\.\s*/, '').length > 80 ? '…' : ''}
                            </span>
                          )}
                        </div>
                        {!q.isCorrect && (
                          <div className="text-xs mt-1">
                            {q.userAnswer ? (
                              <span className="text-red-600">
                                Answered: <strong>{q.userAnswer}</strong> — Correct: <strong>{q.correctAnswer}</strong>
                              </span>
                            ) : (
                              <span className="text-gray-400">
                                Unanswered — Correct: <strong>{q.correctAnswer}</strong>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Explanation (scoring guide) */}
                        {showExplanations && q.explanation && (
                          <div className="mt-2 text-xs text-blue-800 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                            <span className="font-medium">Why:</span> {q.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {filteredQuestions.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    No questions match this filter.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
