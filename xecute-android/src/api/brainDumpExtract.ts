import {APP_CONFIG} from '../config';
import type {GoalMode} from './goalTankService';

export type ExtractedTask = {
  rank: number;
  title: string;
  why: string;
  goalName?: string;
};

export type BrainDumpExtractInput = {
  transcript: string;
  struggle?: string;
  desire?: string;
  goalMode?: GoalMode;
  userName?: string;
};

export type BrainDumpExtractResult = {
  missionTitle: string;
  missionWhy: string;
  topTasks: ExtractedTask[];
  extractedGoal?: string;
  hasMultipleGoals?: boolean;
};

function fallbackTasks(
  text: string,
  desire?: string,
): ExtractedTask[] {
  const title =
    text.split(/[.!?\n]/)[0]?.trim().slice(0, 80) ||
    'Define your immediate next step';
  const why = `Focusing on your input: "${text.slice(0, 80)}${
    text.length > 80 ? '...' : ''
  }"`;
  return [
    {rank: 1, title, why},
    {
      rank: 2,
      title: `Draft core offer & outline first outreach for ${desire || 'your goal'}`,
      why: 'Based on your stated blocker: addresses key bottlenecks.',
    },
    {
      rank: 3,
      title: 'Audit execution bottlenecks & remove non-essential work',
      why: 'Clears mental overhead so you can focus on top priorities.',
    },
    {
      rank: 4,
      title: 'Set up progress tracking and dispatch update to key contacts',
      why: 'Locks in external accountability and keeps momentum high.',
    },
  ];
}

/** Shared voice/text brain dump → `/api/extract-mission`. */
export async function runBrainDumpExtract(
  input: BrainDumpExtractInput,
): Promise<BrainDumpExtractResult> {
  const text = input.transcript.trim();
  let missionTitle =
    text.split(/[.!?\n]/)[0]?.trim().slice(0, 80) ||
    'Define your immediate next step';
  let missionWhy = `Focusing on your input: "${text.slice(0, 80)}${
    text.length > 80 ? '...' : ''
  }"`;
  let topTasks = fallbackTasks(text, input.desire);
  let extractedGoal: string | undefined;
  let hasMultipleGoals: boolean | undefined;

  try {
    const res = await fetch(
      `${APP_CONFIG.apiBaseUrl.replace(/\/$/, '')}/api/extract-mission`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          transcript: text,
          struggle: input.struggle || '',
          desire: input.desire || '',
          goalMode: input.goalMode || 'quick_sprint',
          userName: input.userName || '',
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.task_title || data.title || data.top_tasks)) {
      missionTitle = String(
        data.task_title || data.title || data.mission || missionTitle,
      );
      missionWhy = String(data.task_why || data.why || missionWhy);
      extractedGoal = data.extracted_goal || data.goal || data.missionCategory;
      hasMultipleGoals = Boolean(data.has_multiple_goals);
      if (Array.isArray(data.top_tasks) && data.top_tasks.length) {
        topTasks = data.top_tasks.slice(0, 4).map((t: any, i: number) => ({
          rank: Number(t.rank) || i + 1,
          title: String(t.title || t.taskTitle || `Task ${i + 1}`),
          why: String(t.whyText || t.why || ''),
          goalName: t.goalName ? String(t.goalName) : undefined,
        }));
      } else {
        topTasks = [{rank: 1, title: missionTitle, why: missionWhy}, ...topTasks.slice(1)];
      }
    }
  } catch {
    // Offline fallback tasks already set
  }

  return {
    missionTitle,
    missionWhy,
    topTasks,
    extractedGoal,
    hasMultipleGoals,
  };
}
