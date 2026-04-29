"use client";

export interface NewsItem {
  text: string;
  url: string | null;
}

function parseNewsLine(line: string): NewsItem {
  const urlMatch = line.match(/https?:\/\/[^\s)]+/);
  const url = urlMatch ? urlMatch[0] : null;
  const text = url
    ? line.replace(url, "").replace(/\s{2,}/g, " ").trim()
    : line;
  return { text, url };
}

export function RecentNewsBlock({
  newsLines,
}: {
  newsLines: string[];
}) {
  if (newsLines.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {newsLines.map((line, i) => {
        const { text, url } = parseNewsLine(line);
        return (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground"
          >
            <span>{text}</span>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[11px] text-international-orange hover:underline"
              >
                Source ↗
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
