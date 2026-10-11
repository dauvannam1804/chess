"use server";

import { getTrainerService } from "@/lib/trainer-service-server";

export async function savePositionAction(fen: string, name?: string) {
  return getTrainerService().savePosition(fen, name);
}

export async function listPositionsAction() {
  return getTrainerService().listPositions();
}

export async function createLineFromPgnAction(name: string, pgnText: string) {
  return getTrainerService().createLineFromPgn(name, pgnText);
}

export async function listLinesAction() {
  return getTrainerService().listLines();
}

export async function getLineTreeAction(lineId: number) {
  return getTrainerService().getLineTree(lineId);
}

export async function addBranchAndMoveAction(
  lineId: number,
  parentNodeId: number | null,
  san: string,
) {
  return getTrainerService().addBranchAndMove(lineId, parentNodeId, san);
}

export async function deleteLineAction(lineId: number) {
  getTrainerService().deleteLine(lineId);
}

export async function exportLinePgnAction(lineId: number) {
  return getTrainerService().exportLinePgn(lineId);
}

export async function countByThemeAction() {
  return getTrainerService().countByTheme();
}

export async function getRandomBatchAction(
  filter: { theme?: string; ratingMin?: number; ratingMax?: number },
  n: number,
) {
  return getTrainerService().getRandomBatch(filter, n);
}

export async function recordAttemptAction(puzzleId: string, solved: boolean) {
  return getTrainerService().recordAttempt(puzzleId, solved);
}

export async function getThemeStatsAction() {
  return getTrainerService().getThemeStats();
}
