import {
  ArrowUpRight,
  CalendarDays,
  MessageSquare,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import PipelineBar from "./PipelineBar";

function DeliverableCard({ deliverable }) {
  const navigate = useNavigate();

  const {
    id,
    client,
    clientShort,
    title,
    stage,
    priority,
    owner,
    ownerInitial,
    dueDate,
    progress,
    description,
    comments,
  } = deliverable;

  const priorityStyles = {
    HIGH: "bg-[#fff0ed] text-[#a84a38]",
    MEDIUM: "bg-[#f5f0df] text-[#856d2b]",
    LOW: "bg-[#eeeeeb] text-[#77746d]",
  };

  const openWorkspace = () => {
    navigate(`/deliverables/${id}`);
  };

  return (
    <article
      onClick={openWorkspace}
      className="group cursor-pointer rounded-[20px] border border-[#dedcd5] bg-[#faf9f6] transition duration-200 hover:-translate-y-0.5 hover:border-[#c9c6bd] hover:bg-white hover:shadow-[0_12px_35px_rgba(0,0,0,0.05)]"
    >

      <div className="p-4 sm:p-5">

        <div className="flex items-start justify-between gap-4">

          <div className="flex min-w-0 items-start gap-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#111] text-[9px] font-semibold text-white">
              {clientShort}
            </div>

            <div className="min-w-0">

              <div className="flex flex-wrap items-center gap-2">

                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8b887f]">
                  {client}
                </span>

                <span
                  className={[
                    "rounded-md px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.08em]",
                    priorityStyles[priority],
                  ].join(" ")}
                >
                  {priority}
                </span>

              </div>

              <h3 className="mt-1 text-left text-[14px] font-semibold tracking-[-0.015em] text-[#22211d] sm:text-[15px]">
                {title}
              </h3>

              <p className="mt-1 line-clamp-1 text-[10px] leading-4 text-[#99958c] sm:text-[11px]">
                {description}
              </p>

            </div>
          </div>

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#aaa69d] transition group-hover:bg-[#f1f0eb] group-hover:text-[#111]">
            <ArrowUpRight size={15} />
          </div>

        </div>


        <div className="mt-5">
          <PipelineBar currentStage={stage} />
        </div>


        <div className="mt-4">

          <div className="flex items-center justify-between">

            <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#aaa69d]">
              Production progress
            </span>

            <span className="text-[10px] font-semibold text-[#44413a]">
              {progress}%
            </span>

          </div>

          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#e7e5de]">

            <div
              className="h-full rounded-full bg-[#111] transition-all"
              style={{
                width: `${progress}%`,
              }}
            />

          </div>

        </div>

      </div>


      <div className="flex items-center justify-between border-t border-[#e8e6df] px-4 py-3 sm:px-5">

        <div className="flex items-center gap-3">

          <div className="flex items-center gap-1.5">

            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e7e5de] text-[8px] font-semibold text-[#555149]">
              {ownerInitial}
            </div>

            <span className="text-[9px] font-medium text-[#77746d] sm:text-[10px]">
              {owner}
            </span>

          </div>

          <div className="h-3 w-px bg-[#ddd9d0]" />

          <div className="flex items-center gap-1.5 text-[9px] text-[#99958c] sm:text-[10px]">
            <CalendarDays size={12} />
            {dueDate}
          </div>

        </div>

        <div className="flex items-center gap-1.5 text-[9px] text-[#aaa69d]">
          <MessageSquare size={12} />
          {comments}
        </div>

      </div>

    </article>
  );
}

export default DeliverableCard;