import type { DesktopSnapshot, SegmentRecord } from "@eve/shared";
import { createT } from "../lib/i18n";

export function LiveStageView({ snapshot }: { snapshot: DesktopSnapshot }) {
  const t = createT(snapshot.settings.desktop.language);
  const segment = snapshot.liveStage.activeSegment;
  const recentSegments = snapshot.liveStage.recentSegments.filter((item) => {
    return item.segmentId !== segment?.segmentId;
  });

  if (!segment) {
    return (
      <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5 shadow-[var(--shadow-raised-sm)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            {t("stageModeTitle")}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--foreground)]">
            {t("liveStageWaitingTitle")}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
            {t("liveStageWaitingDescription")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="mx-auto w-full max-w-[1680px] rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 shadow-[var(--shadow-raised-sm)] xl:w-[82vw] xl:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
              {t("stageModeTitle")}
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-[color:var(--foreground)] xl:text-2xl">
              {segment.speakerDisplayName}
            </h2>
          </div>
          <div className="rounded-full bg-[color:var(--surface-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            {stageLanguageLabel(segment, t)}
          </div>
        </div>

        <details className="mt-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
          <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Diagnostics
          </summary>
          <dl className="mt-3 grid gap-3 text-sm text-[color:var(--foreground)] md:grid-cols-2 xl:grid-cols-4">
            <DebugField label="Raw lang" value={segment.rawDetectedLanguage ?? "unknown"} />
            <DebugField label="Normalized" value={segment.detectedLanguage} />
            <DebugField label="Route" value={stageRoute(segment)} />
            <DebugField label="Translation" value={translationState(segment)} />
          </dl>
        </details>

        <div className="mt-4 grid min-h-[50vh] grid-cols-2 gap-4">
          <article className="min-w-0 rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 xl:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              {primaryLabel(segment, t)}
            </p>
            <p className="mt-4 whitespace-pre-wrap break-words text-[1.35rem] leading-[1.65] text-[color:var(--foreground)] xl:text-[1.55rem] 2xl:text-[1.7rem]">
              {segment.improvedAutoTranscript ?? segment.rawTranscript}
            </p>
          </article>
          <article className="min-w-0 rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 xl:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              {secondaryLabel(segment, t)}
            </p>
            <p className="mt-4 whitespace-pre-wrap break-words text-[1.35rem] leading-[1.65] text-[color:var(--foreground)] xl:text-[1.55rem] 2xl:text-[1.7rem]">
              {secondaryText(segment, t)}
            </p>
          </article>
        </div>
      </div>

      {recentSegments.length > 0 && (
        <div className="mx-auto w-full max-w-[1680px] rounded-3xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3 shadow-[var(--shadow-raised-sm)] xl:w-[82vw]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            {t("liveStageRecentTitle")}
          </p>
          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            {recentSegments.map((item) => (
              <article
                key={item.segmentId}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold tracking-tight text-[color:var(--foreground)]">
                    {item.speakerDisplayName}
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {stageLanguageLabel(item, t)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                      {primaryLabel(item, t)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[color:var(--foreground)]">
                      {item.improvedAutoTranscript ?? item.rawTranscript}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                      {secondaryLabel(item, t)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[color:var(--muted)]">
                      {secondaryText(item, t)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function stageLanguageLabel(
  segment: SegmentRecord,
  t: ReturnType<typeof createT>
): string {
  return segment.detectedLanguage === "zh"
    ? t("liveStageLanguagePairZhJa")
    : t("liveStageLanguagePairJa");
}

function primaryLabel(
  segment: SegmentRecord,
  t: ReturnType<typeof createT>
): string {
  return segment.detectedLanguage === "zh"
    ? t("liveStagePrimaryZh")
    : t("liveStagePrimaryJa");
}

function secondaryLabel(
  segment: SegmentRecord,
  t: ReturnType<typeof createT>
): string {
  return segment.detectedLanguage === "zh"
    ? t("liveStageSecondaryJa")
    : t("liveStageSecondaryNotes");
}

function secondaryText(
  segment: SegmentRecord,
  t: ReturnType<typeof createT>
): string {
  if (segment.detectedLanguage === "zh") {
    return segment.jaTranslation ?? t("liveStageTranslationPending");
  }
  return t("liveStageJapaneseDirectDescription");
}

function stageRoute(segment: SegmentRecord): string {
  return segment.detectedLanguage === "zh" ? "zh→ja" : "ja-direct";
}

function translationState(segment: SegmentRecord): string {
  if (segment.detectedLanguage !== "zh") {
    return "not-applicable";
  }
  return segment.jaTranslation ? "ready" : "pending";
}

function DebugField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 break-all text-sm leading-6 text-[color:var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}
