import { describe, expect, it } from "vitest";
import {
  GlmExplainer,
  getExplainer,
  NullExplainer,
} from "@/lib/explainer";

const BASE_INPUT = {
  lineName: "Ý",
  moveSan: "e4",
  fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  movesSoFar: ["e4"],
  isUserMove: true,
};

type CapturedCall = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

/** Fake client đúng shape mà GlmExplainer cần (không gọi API thật). */
function fakeClient(options: {
  content?: string | null;
  throwOnCreate?: Error;
  onCall?: (call: CapturedCall) => void;
}) {
  return {
    chat: {
      completions: {
        create: async (call: CapturedCall) => {
          options.onCall?.(call);
          if (options.throwOnCreate) throw options.throwOnCreate;
          return {
            choices: [{ message: { content: options.content ?? null } }],
          };
        },
      },
    },
  };
}

describe("NullExplainer", () => {
  it("trả {text: null} — không có key thì không có nháp", async () => {
    const explainer = new NullExplainer();

    await expect(explainer.draftAnnotation(BASE_INPUT)).resolves.toEqual({
      text: null,
    });
  });
});

describe("GlmExplainer (client giả)", () => {
  it("gửi prompt tiếng Việt chứa nước đi + FEN và trả nội dung trả về", async () => {
    let captured: CapturedCall | undefined;
    const explainer = new GlmExplainer(
      fakeClient({
        content: "e4 chiếm trung tâm và mở đường cho Tượng C4.",
        onCall: (call) => {
          captured = call;
        },
      }),
      "glm-4.6",
    );

    const result = await explainer.draftAnnotation({
      ...BASE_INPUT,
      lineName: "Gambit Ý",
      fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
      movesSoFar: ["e4", "e5"],
      isUserMove: false,
    });

    expect(result).toEqual({
      text: "e4 chiếm trung tâm và mở đường cho Tượng C4.",
    });
    expect(captured?.model).toBe("glm-4.6");
    const prompt = captured?.messages.map((m) => m.content).join("\n") ?? "";
    expect(prompt).toContain("e4");
    expect(prompt).toContain(BASE_INPUT.fenBefore);
    expect(prompt).toContain("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2");
    expect(prompt).toContain("Gambit Ý");
    expect(prompt).toContain("tại sao");
  });

  it("lỗi API → trả {text: null}, không ném vào UI", async () => {
    const explainer = new GlmExplainer(
      fakeClient({ throwOnCreate: new Error("401 Unauthorized") }),
      "glm-4.6",
    );

    await expect(explainer.draftAnnotation(BASE_INPUT)).resolves.toEqual({
      text: null,
    });
  });

  it("nội dung rỗng từ model → trả {text: null}", async () => {
    const explainer = new GlmExplainer(
      fakeClient({ content: "   " }),
      "glm-4.6",
    );

    await expect(explainer.draftAnnotation(BASE_INPUT)).resolves.toEqual({
      text: null,
    });
  });
});

describe("getExplainer (factory)", () => {
  it("không có key → NullExplainer", () => {
    expect(getExplainer({})).toBeInstanceOf(NullExplainer);
  });

  it("GLM_API_KEY → GlmExplainer; model đọc từ GLM_MODEL, mặc định glm-4.6", () => {
    const explainer = getExplainer({ GLM_API_KEY: "k-test" });
    expect(explainer).toBeInstanceOf(GlmExplainer);
    expect(getExplainer({ GLM_MODEL: "glm-5-turbo", GLM_API_KEY: "k" })).toEqual(
      expect.objectContaining({ model: "glm-5-turbo" }),
    );
    expect(
      getExplainer({ OPENAI_API_KEY: "k-openai" }),
    ).toBeInstanceOf(GlmExplainer);
  });
});
