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
