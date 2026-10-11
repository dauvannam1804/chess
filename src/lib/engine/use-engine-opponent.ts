"use client";

import { useEffect, useRef, useState } from "react";
import { disposeBrowserEngine, getBrowserEngine } from "./browser-engine";

/** Nhịp delay của lượt engine — một nguồn duy nhất cho mọi đối kháng. */
export const ENGINE_FIRST_MOVE_DELAY_MS = 600;
export const ENGINE_REPLY_DELAY_MS = 350;

type EngineOpponentOptions = {
  /** Độ sâu phân tích khi engine đi nước của mình. */
  depth: number;
  /**
   * FEN thế cờ engine phải trả lời; null nghĩa là phiên đã reset — bỏ lượt.
   * Trả về null thay vì ném để hook tự guard như guard `state` cũ.
   */
  currentFen: () => string | null;
  /** Áp nước engine vào thế cờ nội bộ rồi cập nhật UI. */
  applyMove: (uci: string) => void;
  /** Gọi sau khi engine đã đi xong (kiểm tra hết ván/phán định…). */
  afterMove?: () => void;
  /** Engine không đưa được nước (`bestmove (none)`) — thế đã kết thúc. */
  onNoMove?: () => void;
  /** Lỗi engine (analyse quăng exception). */
  onError: (message: string) => void;
};

/**
 * Vòng lặp đối kháng dùng chung (play vs engine, drill tàn cuộc): hẹn giờ có
 * guard phiên, gọi engine phân tích rồi áp nước, tắt cờ thinking — kèm dọn
 * timer + dispose engine khi unmount. Mỗi component giữ phiên của mình và
 * gọi `resetSession()` khi bắt đầu/thoát phiên để vô hiệu hóa kết quả cũ.
 */
export function useEngineOpponent(options: EngineOpponentOptions) {
  const [thinking, setThinking] = useState(false);
  const thinkingRef = useRef(false);
  const generationRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
      void disposeBrowserEngine();
    };
  }, []);

  const engineMove = async (generation: number) => {
    const hookOptions = optionsRef.current;
    const fen = hookOptions.currentFen();
    // Phiên đã reset trong lúc chờ — bỏ qua, trạng thái thinking do ván mới quản.
    if (fen === null || generationRef.current !== generation) return;
    let moved = false;
    try {
      const analysis = await getBrowserEngine().analyse(
        fen,
        hookOptions.depth,
      );
      if (generationRef.current !== generation) return;
      const uci = analysis.bestLineUci[0];
      if (!uci) {
        thinkingRef.current = false;
        setThinking(false);
        hookOptions.onNoMove?.();
        return;
      }
      hookOptions.applyMove(uci);
      moved = true;
    } catch (cause) {
      if (generationRef.current === generation) {
        hookOptions.onError((cause as Error).message);
      }
    } finally {
      if (generationRef.current === generation) {
        thinkingRef.current = false;
        setThinking(false);
      }
    }
    if (moved) hookOptions.afterMove?.();
  };

  /** Vô hiệu mọi hẹn giờ/kết quả của phiên cũ: bump generation + tắt thinking. */
  const resetSession = () => {
    generationRef.current += 1;
    clearTimer();
    thinkingRef.current = false;
    setThinking(false);
  };

  /** Đặt lịch engine phản hồi sau `delay` ms cho phiên hiện tại. */
  const scheduleReply = (delay: number) => {
    thinkingRef.current = true;
    setThinking(true);
    const generation = generationRef.current;
    timerRef.current = window.setTimeout(() => {
      void engineMove(generation);
    }, delay);
  };

  return { thinking, thinkingRef, resetSession, scheduleReply };
}
