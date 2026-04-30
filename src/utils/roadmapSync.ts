export const IN_FLIGHT_QUIZ_STATUSES = new Set([
  'CREATING',
  'GENERATING',
  'IN_PROGRESS',
  'PENDING',
  'PROCESSING',
  'STARTED',
]);

export const toArray = (value: any) => (Array.isArray(value) ? value : []);

export const toPositiveInteger = (value: any) => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

export const normalizePhaseIndex = (value: any) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized)) {
    return -1;
  }
  return normalized > 0 ? normalized - 1 : normalized;
};

export const isReadyRoadmapQuiz = (quiz: any) => {
  if (!quiz || typeof quiz !== 'object') {
    return false;
  }

  const normalizedStatus = String(quiz?.status || '').toUpperCase();
  return !IN_FLIGHT_QUIZ_STATUSES.has(normalizedStatus);
};

export const hasReadyRoadmapQuiz = (quizzes: any) =>
  toArray(quizzes).some(isReadyRoadmapQuiz);

export const mergeUniqueQuizzes = (baseQuizzes: any[] = [], incomingQuizzes: any[] = []) => {
  const merged: any[] = [];
  const indexByQuizId = new Map<number, number>();

  const appendQuiz = (quiz: any) => {
    if (!quiz || typeof quiz !== 'object') {
      return;
    }

    const quizId = toPositiveInteger(quiz?.quizId ?? quiz?.id);
    if (!quizId) {
      merged.push(quiz);
      return;
    }

    const existingIndex = indexByQuizId.get(quizId);
    if (existingIndex != null) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...quiz,
      };
      return;
    }

    indexByQuizId.set(quizId, merged.length);
    merged.push(quiz);
  };

  baseQuizzes.forEach(appendQuiz);
  incomingQuizzes.forEach(appendQuiz);

  return merged;
};

export const groupRoadmapQuizzesByPhase = (roadmapQuizzes: any[] = []) =>
  toArray(roadmapQuizzes).reduce(
    (
      acc: Record<
        number,
        {
          preLearning: any[];
          postLearning: any[];
          byKnowledge: Record<number, any[]>;
        }
      >,
      quiz: any,
    ) => {
      const phaseId = toPositiveInteger(quiz?.phaseId);
      if (!phaseId) {
        return acc;
      }

      if (!acc[phaseId]) {
        acc[phaseId] = {
          preLearning: [],
          postLearning: [],
          byKnowledge: {},
        };
      }

      const intent = String(quiz?.quizIntent || '').toUpperCase();
      if (intent === 'PRE_LEARNING') {
        acc[phaseId].preLearning.push(quiz);
        return acc;
      }

      if (intent === 'POST_LEARNING') {
        acc[phaseId].postLearning.push(quiz);
        return acc;
      }

      const knowledgeId = toPositiveInteger(quiz?.knowledgeId);
      if (knowledgeId) {
        if (!acc[phaseId].byKnowledge[knowledgeId]) {
          acc[phaseId].byKnowledge[knowledgeId] = [];
        }
        acc[phaseId].byKnowledge[knowledgeId].push(quiz);
      }

      return acc;
    },
    {},
  );

export const mergeRoadmapQuizzesIntoStructure = (
  structureData: any,
  roadmapQuizzes: any[] = [],
  mergeQuizState: (quiz: any) => any = quiz => quiz,
) => {
  const quizGroupsByPhase = groupRoadmapQuizzesByPhase(roadmapQuizzes);

  return {
    ...structureData,
    phases: Array.isArray(structureData?.phases)
      ? structureData.phases.map((phase: any) => {
          const phaseId = toPositiveInteger(phase?.phaseId);
          const grouped = phaseId ? quizGroupsByPhase[phaseId] : null;

          const preLearningQuizzes = mergeUniqueQuizzes(
            toArray(phase?.preLearningQuizzes).map(mergeQuizState),
            toArray(grouped?.preLearning).map(mergeQuizState),
          );
          const postLearningQuizzes = mergeUniqueQuizzes(
            toArray(phase?.postLearningQuizzes).map(mergeQuizState),
            toArray(grouped?.postLearning).map(mergeQuizState),
          );

          return {
            ...phase,
            preLearningQuizzes,
            postLearningQuizzes,
            preLearning: preLearningQuizzes[0] || null,
            postLearning: postLearningQuizzes[0] || null,
            knowledges: toArray(phase?.knowledges).map((knowledge: any) => {
              const knowledgeId = toPositiveInteger(knowledge?.knowledgeId ?? knowledge?.id);
              return {
                ...knowledge,
                quizzes: mergeUniqueQuizzes(
                  toArray(knowledge?.quizzes).map(mergeQuizState),
                  knowledgeId && grouped?.byKnowledge?.[knowledgeId]
                    ? grouped.byKnowledge[knowledgeId].map(mergeQuizState)
                    : [],
                ),
              };
            }),
          };
        })
      : structureData?.phases,
  };
};
