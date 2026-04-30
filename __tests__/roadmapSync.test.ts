import {describe, expect, it} from '@jest/globals';
import {
  hasReadyRoadmapQuiz,
  mergeRoadmapQuizzesIntoStructure,
  normalizePhaseIndex,
} from '../src/utils/roadmapSync';

describe('roadmapSync', () => {
  it('groups roadmap PRE_LEARNING quizzes into their phase', () => {
    const structure = {
      phases: [
        {
          phaseId: 10,
          title: 'Phase 1',
          preLearningQuizzes: [],
          postLearningQuizzes: [],
          knowledges: [],
        },
      ],
    };
    const merged = mergeRoadmapQuizzesIntoStructure(structure, [
      {
        quizId: 101,
        phaseId: 10,
        quizIntent: 'PRE_LEARNING',
        status: 'OPEN',
      },
    ]);

    expect(merged.phases[0].preLearningQuizzes).toHaveLength(1);
    expect(merged.phases[0].preLearning?.quizId).toBe(101);
    expect(hasReadyRoadmapQuiz(merged.phases[0].preLearningQuizzes)).toBe(true);
  });

  it('does not treat in-flight pre-learning quizzes as ready', () => {
    expect(hasReadyRoadmapQuiz([
      {
        quizId: 102,
        phaseId: 10,
        quizIntent: 'PRE_LEARNING',
        status: 'PROCESSING',
      },
    ])).toBe(false);
  });

  it('groups post-learning and knowledge quizzes by phase and knowledge id', () => {
    const structure = {
      phases: [
        {
          phaseId: 10,
          preLearningQuizzes: [],
          postLearningQuizzes: [],
          knowledges: [
            {
              knowledgeId: 501,
              quizzes: [],
            },
          ],
        },
      ],
    };
    const merged = mergeRoadmapQuizzesIntoStructure(structure, [
      {
        quizId: 201,
        phaseId: 10,
        quizIntent: 'POST_LEARNING',
      },
      {
        quizId: 301,
        phaseId: 10,
        knowledgeId: 501,
        quizIntent: 'REVIEW',
      },
    ]);

    expect(merged.phases[0].postLearningQuizzes[0].quizId).toBe(201);
    expect(merged.phases[0].postLearning?.quizId).toBe(201);
    expect(merged.phases[0].knowledges[0].quizzes[0].quizId).toBe(301);
  });

  it('keeps one quiz per id and lets roadmap quiz state override inline state', () => {
    const structure = {
      phases: [
        {
          phaseId: 10,
          preLearningQuizzes: [
            {
              quizId: 101,
              phaseId: 10,
              quizIntent: 'PRE_LEARNING',
              status: 'DRAFT',
            },
          ],
          knowledges: [],
        },
      ],
    };
    const merged = mergeRoadmapQuizzesIntoStructure(structure, [
      {
        quizId: 101,
        phaseId: 10,
        quizIntent: 'PRE_LEARNING',
        status: 'OPEN',
      },
    ]);

    expect(merged.phases[0].preLearningQuizzes).toHaveLength(1);
    expect(merged.phases[0].preLearningQuizzes[0].status).toBe('OPEN');
  });

  it('normalizes BE one-based phase indexes for UI comparisons', () => {
    expect(normalizePhaseIndex(1)).toBe(0);
    expect(normalizePhaseIndex(2)).toBe(1);
    expect(normalizePhaseIndex(0)).toBe(0);
    expect(normalizePhaseIndex(undefined)).toBe(-1);
  });
});
