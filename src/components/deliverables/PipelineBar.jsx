import { Check } from "lucide-react";

import { DELIVERABLE_STAGES } from "../../data/deliverables";

function PipelineBar({ currentStage }) {
  const currentIndex = DELIVERABLE_STAGES.findIndex(
    (stage) => stage.id === currentStage
  );

  return (
    <div className="flex items-center">
      {DELIVERABLE_STAGES.map((stage, index) => {
        const completed = index < currentIndex;
        const active = index === currentIndex;

        return (
          <div
            key={stage.id}
            className="flex min-w-0 flex-1 items-center"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <div
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[8px] font-semibold transition",
                  completed
                    ? "border-[#111111] bg-[#111111] text-white"
                    : active
                    ? "border-[#111111] bg-white text-[#111111] ring-2 ring-[#111111]/10"
                    : "border-[#d9d7cf] bg-[#f5f4ef] text-[#aaa79e]",
                ].join(" ")}
              >
                {completed ? <Check size={10} strokeWidth={2.5} /> : index + 1}
              </div>

              <span
                className={[
                  "hidden truncate text-[8px] font-medium uppercase tracking-[0.08em] lg:block",
                  active
                    ? "text-[#111111]"
                    : completed
                    ? "text-[#66635d]"
                    : "text-[#aaa79e]",
                ].join(" ")}
              >
                {stage.shortLabel}
              </span>
            </div>

            {index < DELIVERABLE_STAGES.length - 1 && (
              <div
                className={[
                  "mx-2 h-px flex-1",
                  index < currentIndex
                    ? "bg-[#111111]"
                    : "bg-[#dedcd5]",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default PipelineBar;