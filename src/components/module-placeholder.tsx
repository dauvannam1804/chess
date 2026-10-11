export function ModulePlaceholder({
  title,
  en,
  description,
}: {
  title: string;
  en: string;
  description: string;
}) {
  return (
    <section>
      <h1 className="text-2xl font-bold">
        {title} <span className="text-stone-400">({en})</span>
      </h1>
      <p className="mt-3 max-w-prose text-stone-600">{description}</p>
      <p className="mt-6 inline-block rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
        Module này chưa được xây — xem ticket tiếp theo trên bảng theo dõi.
      </p>
    </section>
  );
}
