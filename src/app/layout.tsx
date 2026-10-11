import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Trainer — Tự học cờ vua",
  description:
    "Ứng dụng tự học cờ vua chạy local: Puzzle, Khai cuộc, Chơi với Engine, Xem lại ván, Tàn cuộc.",
};

const navItems = [
  { href: "/", label: "Sân chơi", en: "Playground" },
  { href: "/puzzle", label: "Puzzle", en: "Puzzle" },
  { href: "/khai-cuoc", label: "Khai cuộc", en: "Repertoire" },
  { href: "/choi-voi-engine", label: "Chơi với Engine", en: "Play vs Engine" },
  { href: "/xem-lai-van", label: "Xem lại ván", en: "Game Review" },
  { href: "/tan-cuoc", label: "Tàn cuộc", en: "Endgame" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-stone-100 text-stone-900">
        <header className="border-b border-stone-300 bg-white">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              ♞ Chess Trainer{" "}
              <span className="font-normal text-stone-500">
                — Tự học cờ vua
              </span>
            </Link>
            <nav aria-label="Điều hướng chính">
              <ul className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-block rounded-md px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-200"
                    >
                      {item.label}
                      <span className="ml-1 text-stone-400">({item.en})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-stone-400">
          Ứng dụng chạy local — dữ liệu nằm trong file SQLite trên máy bạn
          (ADR-0001).
        </footer>
      </body>
    </html>
  );
}
