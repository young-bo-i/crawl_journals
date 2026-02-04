"use client";

import { Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { LogItem } from "./CrawlControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  doaj: "DOAJ",
  nlm: "NLM",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
};

function formatTime(timestamp: number) {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return String(timestamp);
  }
}

function getStatusBadge(status?: string) {
  switch (status) {
    case "success":
      return <Badge variant="success" className="text-[10px] px-1.5 py-0">成功</Badge>;
    case "no_data":
      return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">无数据</Badge>;
    case "failed":
      return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">失败</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>;
  }
}

export default function CrawlLogs({ logs }: { logs: LogItem[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">实时日志</CardTitle>
            <Badge variant="outline" className="text-xs">
              {logs.length} / 100
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <ScrollArea className="h-[300px] rounded-md border bg-muted/30 p-2">
            {logs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">暂无日志</p>
              </div>
            ) : (
              <div className="space-y-1 font-mono text-xs">
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1 rounded",
                      log.status === "failed" && "bg-destructive/10",
                      log.status === "success" && "bg-emerald-500/5"
                    )}
                  >
                    <span className="text-muted-foreground w-16 shrink-0">
                      {formatTime(log.at)}
                    </span>
                    {log.journalId ? (
                      <>
                        <span className="text-primary w-28 shrink-0 truncate">
                          {log.journalId}
                        </span>
                        <span className="text-muted-foreground w-20 shrink-0">
                          {SOURCE_LABELS[log.source ?? ""] ?? log.source}
                        </span>
                        {getStatusBadge(log.status)}
                      </>
                    ) : (
                      <span className="flex-1 text-foreground">{log.message}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
