import {
  createTrainerService,
  getDefaultDbPath,
  type TrainerService,
} from "./trainer-service";

export { isLineMastered } from "./trainer-service";

const globalForTrainer = globalThis as unknown as {
  trainerService?: TrainerService;
};

export function getTrainerService(): TrainerService {
  if (!globalForTrainer.trainerService) {
    globalForTrainer.trainerService = createTrainerService(getDefaultDbPath());
  }
  return globalForTrainer.trainerService;
}
