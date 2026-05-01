export function ConversionFunnel({
  steps,
}: {
  steps: { label: string; value: number; percent: number | null; bg: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {steps.map((step, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between rounded-md px-3 py-2 text-[13px]"
          style={{ background: step.bg }}
        >
          <span className="font-medium">{step.label}</span>
          <strong className="text-md-text">
            {step.value.toLocaleString('fr-FR')}
            {step.percent !== null ? (
              <span className="text-md-text-muted ml-1.5 text-xs font-normal">
                ({step.percent}%)
              </span>
            ) : null}
          </strong>
        </div>
      ))}
    </div>
  );
}
