import {
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

function DeliverableFilters({
  search,
  setSearch,
  client,
  setClient,
  stage,
  setStage,
  priority,
  setPriority,
}) {
  const hasFilters =
    search || client !== "ALL" || stage !== "ALL" || priority !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setClient("ALL");
    setStage("ALL");
    setPriority("ALL");
  };

  return (
    <div className="rounded-[18px] border border-[#dedcd5] bg-[#faf9f6] p-3 sm:p-4">

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">

        {/* Search */}
        <div className="relative flex-1">

          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa69d]"
          />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search deliverables, clients..."
            className="h-10 w-full rounded-xl border border-[#e2e0d9] bg-white pl-9 pr-3 text-xs text-[#22211d] outline-none placeholder:text-[#aaa69d] focus:border-[#aaa69d]"
          />

        </div>


        <div className="grid grid-cols-3 gap-2">

          {/* Client */}
          <div className="relative">
            <select
              value={client}
              onChange={(event) => setClient(event.target.value)}
              className="h-10 w-full appearance-none rounded-xl border border-[#e2e0d9] bg-white px-3 pr-8 text-[10px] font-medium text-[#555149] outline-none focus:border-[#aaa69d] sm:text-xs"
            >
              <option value="ALL">All clients</option>
              <option value="Visista Jewellery">Visista</option>
              <option value="Sreeja Foods">Sreeja Foods</option>
              <option value="Lasabroso">Lasabroso</option>
              <option value="Renobath">Renobath</option>
              <option value="SOO">SOO</option>
              <option value="Dilizen">Dilizen</option>
              <option value="Right Detailing">Right Detailing</option>
            </select>

            <Filter
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#aaa69d]"
            />
          </div>


          {/* Stage */}
          <div className="relative">
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              className="h-10 w-full appearance-none rounded-xl border border-[#e2e0d9] bg-white px-3 pr-8 text-[10px] font-medium text-[#555149] outline-none focus:border-[#aaa69d] sm:text-xs"
            >
              <option value="ALL">All stages</option>
              <option value="CONTENT">Content</option>
              <option value="PRODUCTION">Production</option>
              <option value="EDITING">Editing</option>
              <option value="REVIEW">Review</option>
              <option value="PUBLISHED">Published</option>
            </select>

            <SlidersHorizontal
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#aaa69d]"
            />
          </div>


          {/* Priority */}
          <div className="relative">
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="h-10 w-full appearance-none rounded-xl border border-[#e2e0d9] bg-white px-3 pr-8 text-[10px] font-medium text-[#555149] outline-none focus:border-[#aaa69d] sm:text-xs"
            >
              <option value="ALL">Priority</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <SlidersHorizontal
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#aaa69d]"
            />
          </div>

        </div>


        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[10px] font-medium text-[#77746d] transition hover:bg-white hover:text-[#111111]"
          >
            <X size={13} />
            Clear
          </button>
        )}

      </div>
    </div>
  );
}

export default DeliverableFilters;