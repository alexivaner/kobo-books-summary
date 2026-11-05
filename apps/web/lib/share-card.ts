import { duration } from "../../../packages/analytics";
import {
  type ReadingStatistics,
  type BookStatistic,
  periodLabel,
} from "../../../packages/analytics/statistics";
function lines(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  max: number,
) {
  const rows: string[] = [];
  let remaining = text.trim();
  while (remaining && rows.length < max) {
    if (ctx.measureText(remaining).width <= width) {
      rows.push(remaining);
      remaining = "";
      break;
    }
    const chars = Array.from(remaining);
    let count = 1;
    while (
      count < chars.length &&
      ctx.measureText(chars.slice(0, count + 1).join("")).width <= width
    )
      count++;
    let end = count;
    const lastSpace = chars.slice(0, count).lastIndexOf(" ");
    if (lastSpace > 0) end = lastSpace;
    rows.push(chars.slice(0, end).join("").trimEnd());
    remaining = chars.slice(end).join("").trimStart();
  }
  if (remaining && rows.length) {
    let last = rows.at(-1)!;
    while (last && ctx.measureText(last + "…").width > width)
      last = Array.from(last).slice(0, -1).join("");
    rows[rows.length - 1] = last + "…";
  }
  return rows;
}
/** Browser-only PNG; no network, HTML capture, notes or annotations. */
export async function createShareCard(
  stats: ReadingStatistics,
  ranked: BookStatistic[],
  options: { showBooks: boolean; by: "days" | "time" },
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext("2d");
  if (!c) throw Error("Image generation is unavailable in this browser.");
  const forest = "#1B2B22",
    sage = "#A9CC8A",
    cream = "#F7F3E9",
    muted = "#586557";
  c.fillStyle = cream;
  c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = forest;
  c.fillRect(0, 0, 1080, 17);
  c.font = "bold 48px Georgia";
  c.fillText("Readmory", 72, 100);
  c.font = "28px sans-serif";
  c.fillStyle = muted;
  c.fillText(
    `${periodLabel(stats.period)} · ${stats.source === "all" ? "All readers" : { kobo: "Kobo", kobalt: "Kobalt", koreader: "KOReader" }[stats.source] || stats.source}`,
    72,
    158,
  );
  c.fillStyle = forest;
  c.font = "64px Georgia";
  c.fillText("My reading, remembered.", 72, 250);
  c.fillStyle = forest;
  c.beginPath();
  c.roundRect(72, 295, 936, 225, 24);
  c.fill();
  c.fillStyle = sage;
  c.font = "28px sans-serif";
  c.fillText(
    stats.period.year === null ? "RECORDED BOOK TIME" : "RECORDED SESSION TIME",
    108,
    349,
  );
  c.fillStyle = cream;
  c.font = `${stats.seconds === null ? 58 : 86}px Georgia`;
  c.fillText(
    stats.seconds === null
      ? "Time not recorded"
      : `${stats.minimum ? "At least " : ""}${duration(stats.seconds)}`,
    108,
    452,
  );
  const metrics = [
    [stats.activeDays, "recorded days"],
    [stats.books, "books explored"],
    [stats.finished, "recorded finishes"],
  ];
  for (let i = 0; i < metrics.length; i++) {
    const x = 85 + i * 320;
    c.fillStyle = forest;
    c.font = "60px Georgia";
    c.fillText(String(metrics[i][0]), x, 610);
    c.fillStyle = muted;
    c.font = "28px sans-serif";
    c.fillText(String(metrics[i][1]), x, 660);
  }
  if (options.showBooks && ranked.length) {
    c.fillStyle = forest;
    c.font = "34px Georgia";
    c.fillText(
      options.by === "days"
        ? "The books I returned to"
        : "Where my reading time went",
      72,
      756,
    );
    for (let i = 0; i < Math.min(3, ranked.length); i++) {
      const row = ranked[i],
        x = 72 + i * 320,
        y = 798,
        w = 270,
        h = 300;
      let image: HTMLImageElement | null = null;
      if (row.book.cover?.startsWith("data:image/")) {
        try {
          image = new Image();
          image.src = row.book.cover;
          await image.decode();
        } catch {
          image = null;
        }
      }
      c.save();
      c.beginPath();
      c.roundRect(x, y, w, h, 8);
      c.clip();
      c.fillStyle = i === 1 ? "#DFE7D3" : "#2F4A3C";
      c.fillRect(x, y, w, h);
      if (image && image.naturalWidth) {
        const ratio = Math.min(w / image.naturalWidth, h / image.naturalHeight);
        c.drawImage(
          image,
          x + (w - image.naturalWidth * ratio) / 2,
          y + (h - image.naturalHeight * ratio) / 2,
          image.naturalWidth * ratio,
          image.naturalHeight * ratio,
        );
      } else {
        c.fillStyle = i === 1 ? forest : cream;
        c.font = "32px Georgia";
        lines(c, row.book.title, w - 42, 5).forEach((t, j) =>
          c.fillText(t, x + 21, y + 75 + j * 39),
        );
        c.fillStyle = sage;
        c.fillRect(x + 21, y + h - 31, 55, 3);
      }
      c.restore();
      c.fillStyle = forest;
      c.font = "28px sans-serif";
      lines(c, row.book.title, w, 2).forEach((t, j) =>
        c.fillText(t, x, y + h + 42 + j * 34),
      );
      c.fillStyle = muted;
      c.font = "26px sans-serif";
      c.fillText(
        options.by === "days"
          ? row.days
            ? `${row.days} active ${row.days === 1 ? "day" : "days"}`
            : "Dates unavailable"
          : row.seconds === null
            ? "Duration unavailable"
            : `${row.minimum ? "≥ " : ""}${duration(row.seconds)}`,
        x,
        1210,
      );
    }
  } else {
    c.fillStyle = forest;
    c.font = "52px Georgia";
    c.fillText("One page. One quiet moment.", 72, 860);
    c.fillText("A reading life of my own.", 72, 932);
  }
  c.fillStyle = muted;
  c.font = "23px sans-serif";
  c.fillText(
    stats.period.year === null
      ? "Imported book totals · coverage may be incomplete"
      : stats.unallocatedSeconds > 0
        ? "Incomplete time history · dated sessions only"
        : "Timed sessions only · some activity has no recorded duration",
    72,
    1280,
  );
  c.fillText("alexivaner.github.io/kobo-books-summary", 72, 1317);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Unable to create image."))),
      "image/png",
    ),
  );
}
