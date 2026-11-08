import { TenfoLogo, TenfoMark, TenfoWordmark } from "@/components/brand/logo";

const sizes = [64, 40, 32, 24, 16] as const;

export default function LogoPreviewPage() {
  return (
    <main className="min-h-screen bg-[#FCF9F1] text-[#1D2D23]">
      <header className="border-b border-[#CDD6CB] px-5 py-4 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4">
          <TenfoLogo size={34} wordmarkClassName="text-xl" />
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#657269] sm:text-xs">
            Identity standard 01
          </p>
        </div>
      </header>

      <section className="border-b border-[#CDD6CB]">
        <div className="mx-auto grid max-w-[90rem] lg:grid-cols-[minmax(0,0.92fr)_minmax(28rem,1.08fr)]">
          <div className="flex min-h-[31rem] flex-col justify-between border-[#CDD6CB] px-5 py-10 sm:px-8 sm:py-14 lg:border-r lg:px-12 lg:py-16">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#28764D]">
                Common Datum
              </p>
              <h1 className="mt-5 max-w-2xl text-5xl font-[720] leading-[0.94] tracking-[-0.065em] sm:text-6xl lg:text-7xl">
                Agreement,
                <br />
                made visible.
              </h1>
            </div>
            <p className="mt-12 max-w-xl text-base leading-7 text-[#657269] sm:text-lg sm:leading-8">
              Two parties remain independent. A deliberate gap protects consent. The bright central
              record becomes authoritative only when the required people explicitly approve that
              step.
            </p>
          </div>

          <div className="relative grid min-h-[31rem] place-items-center overflow-hidden bg-[#174B35] px-8 py-16">
            <div
              className="absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "linear-gradient(#FCF9F1 1px, transparent 1px), linear-gradient(90deg, #FCF9F1 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <TenfoMark
              size={224}
              mode="flat"
              className="relative text-[#FCF9F1] sm:h-64 sm:w-64"
              aria-label="Tenfo Common Datum mark"
            />
            <p className="absolute bottom-6 left-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#DCE7D8]/70 sm:bottom-8 sm:left-8">
              Master mark / inverse
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#CDD6CB] px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto grid max-w-[90rem] gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#657269]">
              The construction
            </p>
            <h2 className="mt-3 text-3xl font-[700] tracking-[-0.045em] sm:text-4xl">
              Three pieces.
              <br />
              No implied consent.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-[1.25rem] border border-[#CDD6CB] bg-[#CDD6CB] sm:grid-cols-3">
            <MeaningCell
              index="01"
              title="Requester"
              copy="One party brings the need and its original context."
            />
            <MeaningCell
              index="02"
              title="Professional"
              copy="The other brings judgment, capability, and an independent choice."
            />
            <MeaningCell
              index="03"
              title="Shared record"
              copy="The agreed artifact is distinct, versioned, and intentionally bright."
              accent
            />
          </div>
        </div>
      </section>

      <section className="border-b border-[#CDD6CB] px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto max-w-[90rem]">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#657269]">
                Optical scale
              </p>
              <h2 className="mt-3 text-3xl font-[700] tracking-[-0.045em]">
                One mark, every surface.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#657269]">
              Solid forms and generous negative space preserve the “T” from presentation scale down
              to a 16px browser tab.
            </p>
          </div>

          <div className="mt-9 flex flex-wrap items-end gap-x-10 gap-y-8 border-y border-[#CDD6CB] py-10 sm:gap-x-14">
            {sizes.map((size) => (
              <div key={size} className="flex min-w-14 flex-col items-center gap-3">
                <TenfoMark size={size} />
                <span className="font-mono text-[10px] text-[#657269]">{size}px</span>
              </div>
            ))}
          </div>

          <div className="mt-8 grid overflow-hidden rounded-[1.25rem] border border-[#CDD6CB] md:grid-cols-3">
            <div className="flex min-h-44 items-center justify-center bg-white p-8">
              <TenfoLogo size={36} wordmarkClassName="text-2xl" />
            </div>
            <div className="flex min-h-44 items-center justify-center border-y border-[#CDD6CB] bg-[#174B35] p-8 text-[#FCF9F1] md:border-x md:border-y-0">
              <TenfoLogo size={36} markMode="flat" wordmarkClassName="text-2xl text-[#FCF9F1]" />
            </div>
            <div className="flex min-h-44 items-center justify-center bg-[#EAF3E2] p-8 text-[#174B35]">
              <TenfoLogo size={36} markMode="mono" wordmarkClassName="text-2xl" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto grid max-w-[90rem] gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#657269]">
              Wordmark
            </p>
            <div className="mt-8 border-y border-[#CDD6CB] py-10">
              <TenfoWordmark className="text-6xl sm:text-7xl" />
            </div>
            <p className="mt-5 max-w-lg text-sm leading-6 text-[#657269]">
              A compact, confident grotesk lockup keeps the identity human and legible. The mark
              carries the concept; the name never needs decorative punctuation.
            </p>
          </div>

          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#657269]">
              Core palette
            </p>
            <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-[1.25rem] border border-[#CDD6CB]">
              <ColorCell name="Agreement" value="#174B35" className="bg-[#174B35] text-white" />
              <ColorCell name="Record" value="#91C94E" className="bg-[#91C94E] text-[#1D2D23]" />
              <ColorCell name="Paper" value="#FCF9F1" className="bg-[#FCF9F1] text-[#1D2D23]" />
              <ColorCell name="Ink" value="#1D2D23" className="bg-[#1D2D23] text-white" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function MeaningCell({
  index,
  title,
  copy,
  accent = false,
}: {
  index: string;
  title: string;
  copy: string;
  accent?: boolean;
}) {
  return (
    <article className={accent ? "bg-[#EAF3E2] p-6 sm:p-7" : "bg-white p-6 sm:p-7"}>
      <p className="font-mono text-[10px] text-[#657269]">{index}</p>
      <h3 className="mt-10 text-lg font-[700] tracking-[-0.025em]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#657269]">{copy}</p>
    </article>
  );
}

function ColorCell({ name, value, className }: { name: string; value: string; className: string }) {
  return (
    <div className={`flex min-h-36 flex-col justify-between p-5 sm:min-h-40 sm:p-6 ${className}`}>
      <span className="text-sm font-semibold">{name}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-75">{value}</span>
    </div>
  );
}
