"use server";

import { getTrainerService } from "@/lib/trainer-service-server";
import { getExplainer, type DraftAnnotationInput } from "@/lib/explainer";
import { IMPORT_ENGINE_STRENGTH, parseImportedGame } from "@/lib/review/pgn-import";
import type {
  AddEndgamePositionInput,
  ListGamesOptions,
  SaveGameAnalysisInput,
  SaveGameInput,
} from "@/lib/trainer-service";

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

export async function getAnnotationAction(lineId: number, nodeId: number) {
  return getTrainerService().getAnnotation(lineId, nodeId);
}

export async function setAnnotationAction(
  lineId: number,
  nodeId: number,
  text: string | null,
) {
  getTrainerService().setAnnotation(lineId, nodeId, text);
}

/** Nháp từ Explainer — chỉ là dữ liệu; persist chỉ khi người dùng bấm lưu. */
export async function draftAnnotationAction(input: DraftAnnotationInput) {
  return getExplainer().draftAnnotation(input);
}

export async function getDrillQueueAction() {
  return getTrainerService().getDrillQueue();
}

export async function answerDrillItemAction(nodeId: number, correct: boolean) {
  return getTrainerService().answerDrillItem(nodeId, correct);
}

export async function getDrillSummaryAction() {
  return getTrainerService().getDrillSummary();
}

export async function getLineMasteryAction() {
  return getTrainerService().getLineMastery();
}

export async function saveGameAction(input: SaveGameInput) {
  return getTrainerService().saveGame(input);
}

export async function listGamesAction(options?: ListGamesOptions) {
  return getTrainerService().listGames(options);
}

export async function getGameAction(id: number) {
  return getTrainerService().getGame(id);
}

export async function saveGameAnalysisAction(input: SaveGameAnalysisInput) {
  return getTrainerService().saveGameAnalysis(input);
}

/**
 * Import ván bằng PGN dán vào (US-29): phân tích + tạo Game trong archive,
 * trả về id để UI điều hướng thẳng tới trang xem lại.
 */
export async function importGameFromPgnAction(
  pgn: string,
  userColor: string,
): Promise<number> {
  const parsed = parseImportedGame(pgn);
  const game = getTrainerService().saveGame({
    pgn: parsed.pgn,
    result: parsed.result,
    userColor,
    engineStrength: IMPORT_ENGINE_STRENGTH,
    finalFen: parsed.finalFen,
  });
  return game.id;
}

export async function seedEndgameCatalogAction() {
  return getTrainerService().seedEndgameCatalog();
}

export async function listEndgamePositionsAction() {
  return getTrainerService().listEndgamePositions();
}

export async function addEndgamePositionAction(
  input: AddEndgamePositionInput,
) {
  return getTrainerService().addEndgamePosition(input);
}

export async function answerEndgameItemAction(
  positionId: number,
  correct: boolean,
) {
  return getTrainerService().answerEndgameItem(positionId, correct);
}

export async function getEndgameQueueAction() {
  return getTrainerService().getEndgameQueue();
}

export async function deleteEndgamePositionAction(id: number) {
  getTrainerService().deleteEndgamePosition(id);
}

export async function exportBackupAction() {
  return getTrainerService().exportBackup();
}

export async function importBackupAction(data: unknown) {
  return getTrainerService().importBackup(data);
}
