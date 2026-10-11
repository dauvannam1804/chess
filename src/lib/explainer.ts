/**
 * Seam Explainer: thành phần sinh bản nháp Annotation (Giải thích).
 * Xem GLOSSARY.md — nháp của LLM chỉ là dữ liệu; người dùng sở hữu và sửa.
 *
 * Bản nháp KHÔNG tự lưu: server action gọi draftAnnotation rồi đưa text về
 * UI; text chỉ persist khi người dùng bấm lưu qua TrainerService.setAnnotation.
 */

import OpenAI from "openai";

export type DraftAnnotationInput = {
  lineName: string;
  moveSan: string;
  fenBefore: string;
  fenAfter: string;
  movesSoFar: string[];
  isUserMove: boolean;
};

export type DraftAnnotationResult = { text: string } | { text: null };

export interface Explainer {
  draftAnnotation(input: DraftAnnotationInput): Promise<DraftAnnotationResult>;
}

/** Không có key cấu hình: trả ô trống, mọi thứ khác vẫn chạy (ADR 0001). */
export class NullExplainer implements Explainer {
  async draftAnnotation(
    _input: DraftAnnotationInput,
  ): Promise<DraftAnnotationResult> {
    return { text: null };
  }
}

/**
 * Client chat tương thích OpenAI — chỉ phần GlmExplainer cần.
 * Kiểu cấu trúc (không import OpenAI) để test inject client giả.
 */
export interface GlmChatClient {
  chat: {
    completions: {
      create(input: {
        model: string;
        messages: Array<{ role: "system" | "user"; content: string }>;
      }): Promise<{
        choices: Array<{ message?: { content?: string | null } | null }>;
      }>;
    };
  };
}

/** Explainer đầu tiên theo GLOSSARY: GLM API qua client tương thích OpenAI. */
export class GlmExplainer implements Explainer {
  constructor(
    private readonly client: GlmChatClient,
    private readonly model: string = "glm-4.6",
  ) {}

  async draftAnnotation(
    input: DraftAnnotationInput,
  ): Promise<DraftAnnotationResult> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      return text ? { text } : { text: null };
    } catch {
      // Không ném lỗi API vào UI — không có nháp thì người dùng tự viết.
      return { text: null };
    }
  }
}

const SYSTEM_PROMPT =
  "Bạn là trợ lý học cờ vua. Viết tiếng Việt, ngắn gọn, đúng trọng tâm, " +
  "không dùng markdown.";

/** Base URL OpenAI-compatible chính thức của Z.AI (xem research notes). */
const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4/";

const DEFAULT_GLM_MODEL = "glm-4.6";

/** Chỉ phần env mà Explainer cần — process.env gán được, test tự khởi object. */
export type ExplainerEnv = Record<string, string | undefined>;

/**
 * Factory: đọc env MỘT lần khi gọi để chọn hiện thực.
 * - Có GLM_API_KEY (hoặc fallback OPENAI_API_KEY) → GlmExplainer (GLM qua Z.AI).
 * - Không có key → NullExplainer: mọi thứ khác vẫn chạy, không lỗi văng UI.
 * `env` tham số hóa để test không đụng process.env thật.
 */
export function getExplainer(env: ExplainerEnv = process.env): Explainer {
  const apiKey = env.GLM_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) return new NullExplainer();
  const openai = new OpenAI({ apiKey, baseURL: ZAI_BASE_URL });
  return new GlmExplainer(openai, env.GLM_MODEL ?? DEFAULT_GLM_MODEL);
}

/** UI dùng để bật/tắt nút soạn nháp (đọc cùng env như getExplainer). */
export function hasExplainerConfigured(
  env: ExplainerEnv = process.env,
): boolean {
  return Boolean(env.GLM_API_KEY ?? env.OPENAI_API_KEY);
}

function buildUserPrompt(input: DraftAnnotationInput): string {
  const vai =
    input.isUserMove === true
      ? "Đây là NƯỚC CỦA NGƯỜI DÙNG trong repertoire."
      : "Đây là nước của ĐỐI PHƯƠNG trong repertoire.";
  const chuoi =
    input.movesSoFar.length > 0
      ? input.movesSoFar.join(" ")
      : "(bắt đầu ván)";
  return [
    `Giải thích NGẮN GỌN (tối đa 2 câu) tại sao nước này được chơi: "${input.moveSan}".`,
    vai,
    `Dòng khai cuộc: ${input.lineName}`,
    `Chuỗi nước tới hiện tại: ${chuoi}`,
    `FEN trước nước: ${input.fenBefore}`,
    `FEN sau nước: ${input.fenAfter}`,
    "Trả về CHỈ lời giải thích phù hợp để dán vào ô chú thích, không lời dẫn.",
  ].join("\n");
}

