import { getCurrentVersion, formatVersion, getFetchStatsBySource, getTotalJournalCount } from "@/server/db/repo";

export const runtime = "nodejs";

export async function GET() {
  const totalJournals = await getTotalJournalCount();
  const bySource = await getFetchStatsBySource();
  const currentVersion = await getCurrentVersion();

  return Response.json({
    totalJournals,
    bySource,
    currentVersion,
    currentVersionFormatted: formatVersion(currentVersion),
  });
}
