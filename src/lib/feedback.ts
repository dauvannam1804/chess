/** Loại phản hồi dùng chung (FeedbackBanner): null = ẩn. */
export type Feedback = {
  kind: "error" | "success" | "info";
  text: string;
} | null;
