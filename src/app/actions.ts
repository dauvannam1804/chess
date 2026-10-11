"use server";

import { getTrainerService } from "@/lib/trainer-service-server";

export async function savePositionAction(fen: string, name?: string) {
  return getTrainerService().savePosition(fen, name);
}

export async function listPositionsAction() {
  return getTrainerService().listPositions();
}
