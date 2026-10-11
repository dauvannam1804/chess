"use client";

import { Chess } from "chess.js";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Chessboard } from "react-chessboard";
import { addBranchAndMoveAction, exportLinePgnAction } from "@/app/actions";
import { AnnotationPanel } from "@/components/annotation-panel";
import { EngineAnalysisPanel } from "@/components/engine-analysis-panel";
import { nagLabel } from "@/lib/nag";
import type { LineNode, RepertoireLine } from "@/lib/trainer-service";

function findNode(node: LineNode, id: number | null): LineNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Đường đi từ gốc tới node (gồm cả hai đầu) — suy fenBefore + chuỗi nước. */
function pathToNode(node: LineNode, id: number | null): LineNode[] {
  if (node.id === id) return [node];
  for (const child of node.children) {
    const subPath = pathToNode(child, id);
    if (subPath.length > 0) return [node, ...subPath];
  }
  return [];
}

/** Nhãn số nước kiểu PGN ("1." trắng, "1..." đen) suy từ FEN sau nước. */
function moveLabel(node: LineNode): string {
  if (node.fenAfter === null) return "";
  const parts = node.fenAfter.split(" ");
  const turn = parts[1];
  const fullmove = Number.parseInt(parts[5] ?? "1", 10);
  const mover = turn === "w" ? "b" : "w";
  const number = mover === "w" ? fullmove : fullmove - 1;
  return mover === "w" ? `${number}.` : `${number}...`;
}

function MoveTreeNode({
  node,
  isMainLine,
  depth,
  selectedId,
  onSelect,
}: {
  node: LineNode;
  isMainLine: boolean;
  depth: number;
  selectedId: number | null;
  onSelect: (node: LineNode) => void;
}) {
  return (
    <li className="mt-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <button
          type="button"
          onClick={() => onSelect(node)}
          className={
            isMainLine
              ? `rounded-md px-2 py-0.5 font-mono text-sm font-semibold ${
                  selectedId === node.id
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                }`
              : `rounded-md px-2 py-0.5 font-mono text-sm ${
                  selectedId === node.id
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-900 hover:bg-amber-100"
                }`
          }
          title={node.comments.join(" · ") || undefined}
        >
          {moveLabel(node)} {node.san}
          {node.nags.length > 0 && (
            <span className="ml-0.5">{nagLabel(node.nags)}</span>
          )}
          {!isMainLine && depth > 0 && (
            <span className="ml-1 font-sans text-xs font-normal">↳ nhánh</span>
          )}
        </button>
        {node.startingComments.length > 0 && (
          <span className="text-xs italic text-stone-500">
            {node.startingComments.join(" ")}
          </span>
        )}
        {node.comments.length > 0 && (
          <span className="text-xs italic text-stone-500">
            {node.comments.join(" ")}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul className="ml-4 border-l border-stone-200 pl-3">
          {node.children.map((child, index) => (
            <MoveTreeNode
              key={child.id}
              node={child}
              isMainLine={index === 0}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function LineWorkbench({
  line,
  tree,
  explainerAvailable,
}: {
  line: RepertoireLine;
  tree: LineNode;
  explainerAvailable: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportedPgn, setExportedPgn] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedNode = useMemo(
    () => findNode(tree, selectedId) ?? tree,
    [tree, selectedId],
  );
  const selectedPath = useMemo(
    () => pathToNode(tree, selectedNode.id),
    [tree, selectedNode],
  );
  const boardFen = selectedNode.fenAfter ?? line.startFen;

  const handleSelect = (node: LineNode) => {
    setSelectedId(node.id);
    setError(null);
  };

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare) return false;
    const chess = new Chess(boardFen);
    let san: string;
    try {
      san = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" })
        .san;
    } catch {
      setError(
        "Nước đi không hợp lệ từ thế đang chọn — quân cờ trở về chỗ cũ.",
      );
      return false;
    }
    startTransition(async () => {
      try {
        const node = await addBranchAndMoveAction(
          line.id,
          selectedNode.id,
          san,
        );
        setSelectedId(node.id);
        setError(null);
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Không lưu được nước đi vào Dòng khai cuộc.",
        );
      }
    });
    return true;
  };

  const handleExport = () => {
    startTransition(async () => {
      try {
        setExportedPgn(await exportLinePgnAction(line.id));
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Không xuất được PGN.",
        );
      }
    });
  };

  const mainLineEnd = useMemo(() => {
    let node = tree;
    while (node.children.length > 0) node = node.children[0];
    return node;
  }, [tree]);

  return (
    <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr]">
      <div className="flex flex-col gap-4">
        <div className="w-full">
          <Chessboard
            options={{
              id: `line-${line.id}`,
              position: boardFen,
              boardOrientation: line.userColor === "w" ? "white" : "black",
              onPieceDrop: handlePieceDrop,
            }}
          />
        </div>
        <p className="text-sm text-stone-500">
          Đang xem:{" "}
          {selectedNode.id === null ? (
            <strong>thế bắt đầu</strong>
          ) : (
            <span className="font-mono">
              {moveLabel(selectedNode)} {selectedNode.san}
            </span>
          )}
          {" · "}
          {selectedNode.isUserMove ? (
            <span className="font-semibold text-emerald-700">
              nước của tôi
            </span>
          ) : (
            <span className="font-semibold text-stone-600">
              nước của đối phương
            </span>
          )}
          {" · "}
          Tốt phong tự động thành Hậu (queen).
        </p>
        <p className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-600">
          Chọn một nước trên cây để nạp thế cờ lên bàn. Đi một nước mới trên
          bàn sẽ nối tiếp line; nếu nước đó khác các nhánh có sẵn thì tạo một
          nhánh mới tại thế đang chọn.
        </p>
        {selectedNode.id !== null && (
          <p className="break-all font-mono text-xs text-stone-400">
            FEN: {boardFen}
          </p>
        )}
        <EngineAnalysisPanel fen={boardFen} />
        {mainLineEnd.id !== selectedNode.id && (
          <button
            type="button"
            className="self-start rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            onClick={() => handleSelect(mainLineEnd)}
          >
            Tới cuối nhánh chính (main line)
          </button>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {isPending && (
          <p role="status" className="text-sm text-stone-500">
            Đang lưu…
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Cây nước{" "}
            <span className="text-xs font-normal text-stone-400">
              (xanh = nước chính, vàng = nhánh)
            </span>
          </h2>
          {tree.children.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Line trống — đi nước đầu tiên trên bàn cờ bên trái.
            </p>
          ) : (
            <ul className="mt-3">
              {tree.children.map((child, index) => (
                <MoveTreeNode
                  key={child.id}
                  node={child}
                  isMainLine={index === 0}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              ))}
            </ul>
          )}
        </div>

        {selectedNode.id !== null && (
          <AnnotationPanel
            key={selectedNode.id}
            lineId={line.id}
            nodeId={selectedNode.id}
            lineName={line.name}
            moveSan={selectedNode.san ?? ""}
            fenBefore={
              selectedPath.length > 1
                ? (selectedPath[selectedPath.length - 2].fenAfter ??
                  line.startFen)
                : line.startFen
            }
            fenAfter={selectedNode.fenAfter ?? line.startFen}
            movesSoFar={selectedPath
              .slice(1)
              .map((node) => node.san)
              .filter((san): san is string => san !== null)}
            isUserMove={selectedNode.isUserMove}
            pgnComments={[
              ...selectedNode.startingComments,
              ...selectedNode.comments,
            ]}
            explainerAvailable={explainerAvailable}
          />
        )}

        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">Xuất PGN</h2>
          <p className="mt-1 text-sm text-stone-500">
            Render cây nước (kèm biến án + comment) ngược lại thành PGN qua
            cm-pgn.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            onClick={handleExport}
            disabled={isPending}
          >
            {exportedPgn === null ? "Xuất PGN" : "Xuất lại PGN"}
          </button>
          {exportedPgn !== null && (
            <>
              <textarea
                readOnly
                className="mt-3 h-40 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs"
                value={exportedPgn}
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="mt-1 text-xs text-stone-400">
                Bấm vào ô trên để bôi đen rồi sao chép (Ctrl/Cmd+C).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
