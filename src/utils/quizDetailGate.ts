import QuizAPI from '../api/QuizAPI';

export function hasCompletedExamAttempt(history: any[]) {
  return history.some(item => {
    const status = String(item?.status || '').toUpperCase();
    const mode = String(item?.attemptMode || item?.mode || '').toUpperCase();
    const isPractice = item?.isPracticeMode === true || mode === 'PRACTICE';
    return !isPractice && (status === 'COMPLETED' || status === 'SUBMITTED');
  });
}

export async function canOpenQuizDetailAfterExam(quizId: number, groupId?: number) {
  if (!Number.isInteger(quizId) || quizId <= 0) {
    return false;
  }

  let response;
  if (Number.isInteger(groupId) && Number(groupId) > 0) {
    try {
      response = await QuizAPI.getGroupAttemptHistory(Number(groupId), quizId);
    } catch {
      response = await QuizAPI.getAttemptHistory(quizId);
    }
  } else {
    response = await QuizAPI.getAttemptHistory(quizId);
  }

  return hasCompletedExamAttempt(Array.isArray(response?.data) ? response.data : []);
}
