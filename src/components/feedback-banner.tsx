import type { Feedback } from "@/lib/feedback";

const FEEDBACK_CLASS: Record<Exclude<Feedback, null>["kind"], string> = {
  error: "rounded-md bg-red-100 px-3 py-2 text-sm text-red-800",
  success: "rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800",
  info: "rounded-md bg-stone-200 px-3 py-2 text-sm text-stone-700",
};

/**
 * Banner phản hồi 3 màu (error đỏ / success xanh / info xám) dùng chung mọi
 * module luyện — role là `alert` cho lỗi, `status` cho loại còn lại.
 */
export function FeedbackBanner({
  feedback,
  className = "",
}: {
  feedback: Feedback;
  className?: string;
}) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      className={
        className.length > 0
          ? `${FEEDBACK_CLASS[feedback.kind]} ${className}`
          : FEEDBACK_CLASS[feedback.kind]
      }
    >
      {feedback.text}
    </p>
  );
}
