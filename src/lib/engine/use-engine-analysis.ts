"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserEngine } from "./browser-engine";
import type { EngineAnalysis } from "./engine";
import {
  DEFAULT_ENGINE_STRENGTH,
  type EngineStrength,
} from "./strength";

/** Depth phân tích cho panel eval (đủ nhọn mà nhanh trên WASM). */
export const ENGINE_ANALYSIS_DEPTH = 12;
export const ENGINE_ANALYSIS_DEBOUNCE_MS = 500;

export type EngineAnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; analysis: EngineAnalysis }
  | { status: "error"; message: string };

/**
 * Hook client dùng Engine (singleton worker): tự phân tích (debounce) mỗi
 * khi `fen` đổi, cho bấm chạy lại, và chọn độ mạnh (1..8). Kết quả cũ của
 * lần chạy trễ bị bỏ qua qua run token — không rò kết quả nhảy cóc.
 */
export function useEngineAnalysis(
  fen: string,
  options: { depth?: number; auto?: boolean } = {},
) {
  const depth = options.depth ?? ENGINE_ANALYSIS_DEPTH;
  const auto = options.auto ?? true;
  const [state, setState] = useState<EngineAnalysisState>({ status: "idle" });
  const [strength, setStrengthState] =
    useState<EngineStrength>(DEFAULT_ENGINE_STRENGTH);
  const runToken = useRef(0);

  const run = useCallback(async () => {
    const token = ++runToken.current;
    setState({ status: "loading" });
    try {
      const analysis = await getBrowserEngine().analyse(fen, depth);
      if (runToken.current === token) setState({ status: "done", analysis });
    } catch (cause) {
      if (runToken.current === token) {
        setState({
          status: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Không phân tích được thế cờ này.",
        });
      }
    }
  }, [fen, depth]);

  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => {
      void run();
    }, ENGINE_ANALYSIS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [auto, run]);

  const setStrength = useCallback(
    (level: EngineStrength) => {
      setStrengthState(level);
      void getBrowserEngine()
        .setStrength(level)
        .catch(() => {
          // Lỗi setoption sẽ lộ ở lần analyse kế tiếp; không phá UI ở đây.
        })
        .then(() => run());
    },
    [run],
  );

  return { state, strength, setStrength, run };
}
